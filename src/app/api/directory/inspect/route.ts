import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { readSiteMetadata } from "@/lib/siteMetadata";

/**
 * Reads a pasted URL and hands back a prefilled listing. Deliberately open
 * to logged-out visitors: the whole point of the new submit flow is that
 * nobody has to create an account to find out what submitting involves.
 *
 * That makes it an unauthenticated endpoint that fetches an attacker-chosen
 * URL, so two things carry the weight. `readSiteMetadata` pins the
 * connection to an already-checked public IP (the SSRF guard), and the rate
 * limit below keeps it from being used as a general purpose request proxy
 * or a way to scan with our server's address.
 *
 * Nothing is written to the database here. The result is a draft in the
 * submitter's browser until they finish the form and sign in.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown";
  // Hashed: this key is stored, and a raw IP is personal data we have no
  // reason to keep in a rate-limit table.
  const limited = !(await checkRateLimit(`directory-inspect:${privateRateLimitKey(ip)}`, 20, 10 * 60 * 1000));
  if (limited) {
    return NextResponse.json(
      { error: "That is a lot of lookups. Give it a few minutes." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const raw = typeof body.url === "string" ? body.url.trim() : "";
  if (!raw) return NextResponse.json({ error: "Paste your tool's web address." }, { status: 400 });

  // People type "example.com", not "https://example.com".
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return NextResponse.json({ error: "That does not look like a web address." }, { status: 400 });
  }
  if (!parsed.hostname.includes(".")) {
    return NextResponse.json({ error: "That does not look like a web address." }, { status: 400 });
  }

  try {
    const metadata = await readSiteMetadata(parsed.toString());
    return NextResponse.json(metadata);
  } catch (err) {
    // The message is written for the submitter, not for us: it tells them
    // the site did not answer, and the form lets them carry on by hand.
    const message = err instanceof Error ? err.message : "We could not read that page.";
    return NextResponse.json({ error: message, url: parsed.toString() }, { status: 422 });
  }
}
