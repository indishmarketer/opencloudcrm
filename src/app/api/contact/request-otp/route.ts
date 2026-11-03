import { NextRequest, NextResponse } from "next/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { requestOtp } from "@/lib/otp";
import { getAttributionFromRequest } from "@/lib/attribution";
import { z } from "zod";
import { normalizeCountry } from "@/lib/countries";
import { ensureContact } from "@/lib/contacts";

const RequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  name: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  updatesOptIn: z.boolean().optional(),
  turnstileToken: z.string().min(1).max(4096),
}).strict();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`contact-otp:${ip}`, 5, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { email, name, message, updatesOptIn, turnstileToken } = parsed.data;
  if (!(await checkRateLimit(`contact-otp-email:${privateRateLimitKey(email)}`, 3, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const humanVerified = await verifyTurnstile(turnstileToken, ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human." }, { status: 400 });
  }

  // Captured now (not at final verify) so a magic link clicked from a
  // different device/session still has everything needed to complete the
  // submission -- see completeContactVerification.
  const attribution = getAttributionFromRequest(req);
  const country = normalizeCountry(req.headers.get("cf-ipcountry"));
  // Attach the name now -- requestOtp() below sends the code email, which
  // is itself what first creates this person's contacts row (via
  // sendEmail -> ensureContact) with no name on it. Someone who opens that
  // email but never returns to enter the code would otherwise stay
  // permanently nameless even though we had their real name right here.
  // The country is no longer asked for -- it is detected from the IP.
  await ensureContact({
    email, name, country, countrySource: country ? "ip" : undefined,
  }).catch((err) => console.error("contact form ensureContact failed (non-fatal):", err));
  const sent = await requestOtp(email, "contact", { name, message, updatesOptIn, attribution, country });
  if (!sent) {
    return NextResponse.json({ error: "We couldn't send the verification email. Please try again in a moment." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
