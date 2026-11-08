import { NextRequest, NextResponse } from "next/server";
import { createMagicLinkToken } from "@/lib/auth";
import { isAuthorizedConsoleEmail } from "@/lib/consoleAdmins";
import { sendEmail, isEmailProviderConfigured } from "@/lib/email";
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

    // No SES or Brevo configured yet: this is most likely a fresh deploy
    // with nobody able to log in at all otherwise (console login IS the
    // magic link -- see README.md), not just a routine missed send. Print
    // the real, usable link to the server's own logs (visible in Coolify's
    // Runtime Logs, same place deploy issues have already been diagnosed
    // from all session) instead of silently trying and failing to email
    // it. Never happens once a provider is configured -- sendEmail's own
    // "no provider" branch below would otherwise just log a generic
    // warning with nothing actionable in it.
    if (!isEmailProviderConfigured()) {
      console.warn(
        `\n==================== CONSOLE LOGIN LINK ====================\n` +
        `No email provider (SES or Brevo) is configured yet, so this\n` +
        `couldn't be emailed to ${normalized}. Open it directly to log in:\n\n` +
        `${link}\n\n` +
        `It expires soon and is single-use. Once SES_* or BREVO_API_KEY\n` +
        `is set, this message stops appearing and magic links are emailed\n` +
        `normally.\n` +
        `==============================================================\n`
      );
      return NextResponse.json({ ok: true });
    }

    const tpl = await getEmailTemplate("magic-link-login");
    const vars = { link };
    // This template's from_email seeds to a *@example.com placeholder
    // (migrations 001/032/066) that's never a real, deliverable sender for
    // ANY deployment -- and this is the one email a fresh self-host needs
    // before anyone can log in to customize it via Console -> Email ->
    // Templates. Fall back to sendEmail's own EMAIL_FROM/SITE_URL-derived
    // default instead of forcing that placeholder through, so console
    // login works out of the box on every self-host. An admin who already
    // changed this template's sender to something real keeps it.
    const isPlaceholderSender = /@example\.com$/i.test(tpl.from_email);
    await sendEmail({
      to: normalized,
      subject: applyTemplateVars(tpl.subject, vars),
      html: applyTemplateVars(tpl.body_html, vars),
      from: isPlaceholderSender ? undefined : tpl.from_email,
      critical: tpl.critical,
      templateKey: tpl.key,
      category: "fixed",
      trackOpens: tpl.track_opens,
    });
  }

  return NextResponse.json({ ok: true });
}
