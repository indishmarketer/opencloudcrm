import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { requestOtp } from "@/lib/otp";
import { verifyTurnstile } from "@/lib/turnstile";
import { getLeadMagnetById } from "@/lib/leadMagnets";
import { completeGuideVerification, type GuidePayload } from "@/lib/otpCompletion";
import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { ensureContact } from "@/lib/contacts";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/liveSiteUrl";

const RequestSchema = z.object({
  guideId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: z.string().trim().max(30).optional(),
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
  const { guideId, name, email, phone, turnstileToken } = parsed.data;

  if (!(await checkRateLimit(`guide-request-email:${privateRateLimitKey(email)}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const humanVerified = await verifyTurnstile(turnstileToken, ip === "unknown" ? undefined : ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human. Try again." }, { status: 400 });
  }

  const guide = await getLeadMagnetById(guideId);
  if (!guide || !guide.published) {
    return NextResponse.json({ error: "That guide isn't available right now." }, { status: 404 });
  }

  const payload: GuidePayload = { guideId: guide.id, name, phone: phone || null };

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
    await completeGuideVerification(email, payload);

    if (guide.file_url) {
      const safeName = escapeHtml(name.trim().split(/\s+/)[0] || "there");
      const safeTitle = escapeHtml(guide.title);
      const safeHeadline = escapeHtml(guide.headline);
      const downloadUrl = guide.file_url;
      await sendEmail({
        to: email,
        subject: `Your Guide: ${guide.title}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0a0a0a; line-height: 1.6;">
            <h2 style="font-size: 22px; font-weight: 600; margin-bottom: 8px;">Here is your guide, ${safeName}</h2>
            <p style="font-size: 16px; font-weight: 500; color: #0a0a0a; margin-bottom: 4px;">${safeTitle}</p>
            <p style="color: #666; margin-bottom: 24px;">${safeHeadline}</p>
            <div style="margin: 32px 0;">
              <a href="${downloadUrl}" style="background-color: #0a0a0a; color: #ffffff; padding: 14px 28px; border-radius: 9999px; text-decoration: none; font-weight: 500; font-size: 14px; display: inline-block;">Download Guide (PDF)</a>
            </div>
            <p style="color: #888; font-size: 13px; margin-top: 32px;">You can also access your guide anytime at: <a href="${SITE_URL}/guide/${guide.slug}?unlocked=1" style="color: #0a0a0a;">${SITE_URL}/guide/${guide.slug}?unlocked=1</a></p>
          </div>
        `,
        category: "fixed",
      }).catch((err) => console.error("Direct guide email send failed:", err));
    }

    return NextResponse.json({
      ok: true,
      alreadyVerified: true,
      downloadUrl: guide.file_url,
      slug: guide.slug,
      title: guide.title,
    });
  }

  // New visitor: attach the name now -- requestOtp() below sends the code
  // email, which is itself what first creates this person's contacts row
  // (via sendEmail -> ensureContact) with no name on it. Someone who opens
  // that email but never returns to finish verifying would otherwise stay
  // permanently nameless even though we had their real name right here.
  await ensureContact({
    email, name, phone: phone || null, phoneSource: phone ? "form" : undefined,
  }).catch((err) => console.error("guide request ensureContact failed (non-fatal):", err));

  // Send OTP email to verify ownership
  const sent = await requestOtp(email, "guide", payload);
  if (!sent) {
    return NextResponse.json({ error: "We couldn't send the verification email. Please try again in a moment." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, alreadyVerified: false });
}
