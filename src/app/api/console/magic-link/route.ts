import { NextRequest, NextResponse } from "next/server";
import { createMagicLinkToken } from "@/lib/auth";
import { isAuthorizedConsoleEmail } from "@/lib/consoleAdmins";
import { sendEmail } from "@/lib/email";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { SITE_URL } from "@/config/brand";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`magic-link:${ip}`, 5, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const { email } = await req.json();
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (normalized && !(await checkRateLimit(`magic-link-email:${privateRateLimitKey(normalized)}`, 3, 60 * 60 * 1000))) {
    return NextResponse.json({ ok: true });
  }

  // Always return the same generic response, whether or not the email is
  // authorized, so this endpoint can't be used to enumerate admin emails.
  if (normalized && (await isAuthorizedConsoleEmail(normalized))) {
    const token = await createMagicLinkToken(normalized);
    const link = `${SITE_URL}/api/console/verify?token=${token}`;
    const tpl = await getEmailTemplate("magic-link-login");
    const vars = { link };
    await sendEmail({
      to: normalized,
      subject: applyTemplateVars(tpl.subject, vars),
      html: applyTemplateVars(tpl.body_html, vars),
      from: tpl.from_email,
      critical: tpl.critical,
      templateKey: tpl.key,
      category: "fixed",
      trackOpens: tpl.track_opens,
    });
  }

  return NextResponse.json({ ok: true });
}
