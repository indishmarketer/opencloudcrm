import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { requestOtp } from "@/lib/otp";
import { verifyTurnstile } from "@/lib/turnstile";
import { getGuideDocumentById } from "@/lib/guideDocuments";
import { completeGuideVerification, type GuidePayload } from "@/lib/otpCompletion";
import { pool } from "@/lib/db";
import { ensureContact } from "@/lib/contacts";
import { detectEmailTypo } from "@/lib/emailValidation";
import { validatePhoneNumber } from "@/lib/phoneValidation";
import { normalizeCountry } from "@/lib/countries";

const RequestSchema = z.object({
  guideId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: z.string().trim().max(30).optional(),
  country: z.string().trim().length(2).optional(),
  turnstileToken: z.string().min(1).max(4096),
}).strict();

/** Requesting a guide:
 * 1. If the contact or user ALREADY exists in the database:
 *    We DO NOT send an OTP verification code. Their email is already known.
 *    We immediately unlock the download, record the activity, and send a direct
 *    email containing the download link.
 * 2. If this is a NEW contact (not in contacts or users):
 *    We send the OTP verification magic link so their email is verified
 *    before adding them to contacts.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`guide-request:${ip}`, 5, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check those details." }, { status: 400 });
  const { guideId, name, phone, turnstileToken } = parsed.data;

  // Auto-correct common email typos
  const typo = detectEmailTypo(parsed.data.email);
  const email = typo.hasTypo && typo.suggestedEmail ? typo.suggestedEmail : parsed.data.email;

  // Validate phone if supplied
  const detectedCountry = normalizeCountry(req.headers.get("cf-ipcountry"));
  const selectedCountry = normalizeCountry(parsed.data.country) || detectedCountry;
  if (phone) {
    const phoneVal = validatePhoneNumber(selectedCountry, phone, true);
    if (!phoneVal.isValid && phoneVal.error) {
      return NextResponse.json({ error: phoneVal.error }, { status: 400 });
    }
  }

  if (!(await checkRateLimit(`guide-request-email:${privateRateLimitKey(email)}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const humanVerified = await verifyTurnstile(turnstileToken, ip === "unknown" ? undefined : ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human. Try again." }, { status: 400 });
  }

  const guide = await getGuideDocumentById(guideId);
  if (!guide || !guide.is_active) {
    return NextResponse.json({ error: "That guide isn't available right now." }, { status: 404 });
  }

  const payload: GuidePayload = { guideId: guide.id, name, phone: phone || null, country: selectedCountry };

  // Check if this contact or user already exists in the database
  const existing = await pool.query(
    `SELECT id FROM contacts WHERE LOWER(email) = LOWER($1)
     UNION
     SELECT id FROM users WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email]
  );

  if (existing.rows.length > 0) {
    // Contact already exists: no need to send OTP verification code!
    const completed = await completeGuideVerification(email, payload);
    if (!completed) return NextResponse.json({ error: "That guide isn't available right now." }, { status: 404 });

    return NextResponse.json({
      ok: true,
      alreadyVerified: true,
      downloadUrl: completed.downloadUrl,
      title: completed.title,
    });
  }

  // New visitor: attach the name now -- requestOtp() below sends the code
  // email, which is itself what first creates this person's contacts row
  // (via sendEmail -> ensureContact) with no name on it. Someone who opens
  // that email but never returns to finish verifying would otherwise stay
  // permanently nameless even though we had their real name right here.
  // The source is the guide request, not whichever page hosts the popup.
  await ensureContact({ source: "guide", sourceDetail: "Free guide",
    email, name, phone: phone || null, phoneSource: phone ? "form" : undefined,
    country: selectedCountry, countrySource: selectedCountry ? "form" : undefined,
  }).catch((err) => console.error("guide request ensureContact failed (non-fatal):", err));

  // Send OTP email to verify ownership
  const sent = await requestOtp(email, "guide", payload);
  if (!sent) {
    return NextResponse.json({ error: "We couldn't send the verification email. Please try again in a moment." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, alreadyVerified: false });
}
