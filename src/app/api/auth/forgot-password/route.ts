import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { createPasswordResetToken } from "@/lib/auth";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendEmail } from "@/lib/email";
import { getEmailTemplateOptional, applyTemplateVars } from "@/lib/emailTemplates";
import { firstNameOf } from "@/lib/emailAutomation";
import { escapeHtml } from "@/lib/escapeHtml";
import { raiseAlert } from "@/lib/systemAlerts";
import { SITE_URL } from "@/lib/liveSiteUrl";
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

  const result = await pool.query("SELECT id, email, name FROM users WHERE email = $1", [email]);
  const user = result.rows[0];
  if (!user) return genericResponse();

  const token = await createPasswordResetToken(user.id, user.email);
  const tpl = await getEmailTemplateOptional("password-reset");
  if (tpl) {
    const vars = {
      first_name: escapeHtml(firstNameOf(user.name)),
      reset_url: `${SITE_URL}/reset-password?token=${token}`,
    };
    await sendEmail({
      to: user.email,
      subject: applyTemplateVars(tpl.subject, vars),
      html: applyTemplateVars(tpl.body_html, vars),
      from: tpl.from_email,
      critical: tpl.critical,
      templateKey: tpl.key,
      category: "fixed",
      trackOpens: tpl.track_opens,
    });
  } else {
    // Keep the generic response identical either way (anti-enumeration),
    // but the owner needs to know this is broken -- a deleted
    // "Password reset" template means nobody can reset a forgotten password.
    raiseAlert({
      kind: "missing_email_template",
      dedupeKey: "missing_email_template:password-reset",
      severity: "critical",
      title: "The \"Password reset\" email has been deleted",
      detail: "Someone just requested a password reset and no email went out. Recreate it in Email -> Library.",
      link: "/console/email/library",
    }).catch(() => {});
  }

  return genericResponse();
}
