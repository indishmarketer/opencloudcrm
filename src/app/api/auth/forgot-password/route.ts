import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { createPasswordResetToken } from "@/lib/auth";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { firstNameOf } from "@/lib/emailAutomation";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { sendEmail } from "@/lib/email";
import { getBusiness } from "@/lib/businessProfile";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_NAME } from "@/config/brand";
import { z } from "zod";

const ForgotSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  turnstileToken: z.string().min(1).max(4096),
}).strict();

// Always responds the same way whether or not the email is registered, so
// this can't be used to check which emails have an account here.
function genericResponse() {
  return NextResponse.json({
    ok: true,
    message: "If that email has an account, we've sent a password reset link to it.",
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`forgot-password:${ip}`, 5, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = ForgotSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { email, turnstileToken } = parsed.data;
  if (!(await checkRateLimit(`forgot-email:${privateRateLimitKey(email)}`, 3, 60 * 60 * 1000))) {
    return genericResponse();
  }

  const humanVerified = await verifyTurnstile(turnstileToken, ip === "unknown" ? undefined : ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Could not verify you're human. Try again." }, { status: 400 });
  }

  const result = await pool.query("SELECT id, email, name FROM users WHERE lower(email) = $1", [email]);
  const user = result.rows[0];
  if (!user) return genericResponse();

  const token = await createPasswordResetToken(user.id, user.email);
  // Sent directly, not through an automation: a reset must work on every
  // install without anyone building a workflow first, and the link must
  // not pass through webhooks or run history. It goes only to the address
  // already on the account (from the users row, never the request body).
  const resetUrl = `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const brand = (await getBusiness().catch(() => null))?.brand || SITE_NAME;
  const firstName = escapeHtml(firstNameOf(user.name));
  await sendEmail({
    to: user.email,
    subject: `Reset your ${brand} password`,
    html:
      `<p>Hi ${firstName},</p>` +
      `<p>We received a request to reset the password for your ${escapeHtml(brand)} account. This link works once and expires in 30 minutes.</p>` +
      `<p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:999px;text-decoration:none;">Reset password</a></p>` +
      `<p>If you didn’t ask for this, you can ignore this email. Your password won’t change.</p>`,
    critical: true,
    category: "fixed",
    templateKey: "password-reset",
    trackClicks: false,
    trackOpens: false,
  }).catch((error) => console.error("Password reset email failed:", error));

  return genericResponse();
}
