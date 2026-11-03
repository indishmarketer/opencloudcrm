import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { requestOtp } from "@/lib/otp";
import { verifyTurnstile } from "@/lib/turnstile";
import { getAttributionFromRequest } from "@/lib/attribution";
import { z } from "zod";
import { normalizeCountry } from "@/lib/countries";
import { ensureContact } from "@/lib/contacts";

const SubscribeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
  source: z.string().trim().max(100).optional(),
  turnstileToken: z.string().min(1).max(4096),
}).strict();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`newsletter:${ip}`, 5, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = SubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription details." }, { status: 400 });
  const { name, email, source, turnstileToken } = parsed.data;
  if (!(await checkRateLimit(`newsletter-email:${privateRateLimitKey(email)}`, 3, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const humanVerified = await verifyTurnstile(turnstileToken, ip === "unknown" ? undefined : ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human. Try again." }, { status: 400 });
  }

  const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  const userId = existingUser.rows[0]?.id || null;

  await pool.query(
    `INSERT INTO newsletter_subscribers (email, name, source, verified, user_id)
     VALUES ($1, $2, $3, false, $4)
     ON CONFLICT (email) DO UPDATE SET name = $2, user_id = COALESCE(newsletter_subscribers.user_id, EXCLUDED.user_id)`,
    [email, name, source || "", userId]
  );

  const attr = getAttributionFromRequest(req);
  await pool.query(
    `INSERT INTO attribution_events
       (user_id, email, event_type, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_page)
     VALUES ($1, $2, 'newsletter', $3, $4, $5, $6, $7, $8, $9)`,
    [userId, email, attr.utm_source, attr.utm_medium, attr.utm_campaign, attr.utm_term, attr.utm_content, attr.referrer, attr.landing_page]
  );

  // Attach the name now, not only on verification -- requestOtp() below is
  // about to send the code email, and that send is itself what first
  // creates this person's contacts row (via sendEmail -> ensureContact)
  // with no name on it. Someone who opens that email but never comes back
  // to enter the code would otherwise stay permanently nameless even
  // though we had their real name right here. The country is no longer
  // asked for -- it is detected from the visitor's IP.
  const country = normalizeCountry(req.headers.get("cf-ipcountry"));
  await ensureContact({
    email, name, userId, country, countrySource: country ? "ip" : undefined,
  }).catch((err) => console.error("newsletter ensureContact failed (non-fatal):", err));

  const sent = await requestOtp(email, "newsletter", { country });
  if (!sent) {
    return NextResponse.json({ error: "We couldn't send the verification email. Please try again in a moment." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
