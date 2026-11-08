import { NextRequest, NextResponse } from "next/server";
import { createMagicLinkToken } from "@/lib/auth";
import { isAuthorizedConsoleEmail } from "@/lib/consoleAdmins";
import { sendEmail, isEmailProviderConfigured } from "@/lib/email";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { SITE_URL } from "@/config/brand";

/** Overridable so a self-hoster stuck testing deliverability (SES/Brevo
 * setup, DNS, etc.) can raise these temporarily instead of waiting out the
 * window or editing the rate_limits table directly -- see MAGIC_LINK_*_RATE_LIMIT
 * in .env.example. Unset/invalid falls back to the original fixed limits. */
function rateLimitEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  const ipLimit = rateLimitEnv("MAGIC_LINK_IP_RATE_LIMIT", 5);
  const ipOk = await checkRateLimit(`magic-link:${ip}`, ipLimit, 10 * 60 * 1000);
  // TEMP DEBUG -- remove once the silent-send issue is confirmed fixed.
  console.log(`[MAGIC-LINK-DEBUG] ip=${ip} ipLimit=${ipLimit} ipOk=${ipOk}`);
  if (!ipOk) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const { email } = await req.json();
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  const emailLimit = rateLimitEnv("MAGIC_LINK_EMAIL_RATE_LIMIT", 3);
  const emailOk = await checkRateLimit(`magic-link-email:${privateRateLimitKey(normalized)}`, emailLimit, 60 * 60 * 1000);
  console.log(`[MAGIC-LINK-DEBUG] normalized=${normalized} emailLimit=${emailLimit} emailOk=${emailOk}`);
  if (normalized && !emailOk) {
    return NextResponse.json({ ok: true });
  }

  const authorized = normalized ? await isAuthorizedConsoleEmail(normalized) : false;
  console.log(`[MAGIC-LINK-DEBUG] authorized=${authorized}`);

  // Always return the same generic response, whether or not the email is
  // authorized, so this endpoint can't be used to enumerate admin emails.
  if (normalized && authorized) {
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
    console.log(`[MAGIC-LINK-DEBUG] tpl.from_email=${tpl.from_email} isPlaceholderSender=${isPlaceholderSender} EMAIL_FROM=${process.env.EMAIL_FROM}`);
    const result = await sendEmail({
      to: normalized,
      subject: applyTemplateVars(tpl.subject, vars),
      html: applyTemplateVars(tpl.body_html, vars),
      from: isPlaceholderSender ? undefined : tpl.from_email,
      critical: tpl.critical,
      templateKey: tpl.key,
      category: "fixed",
      trackOpens: tpl.track_opens,
    });
    console.log(`[MAGIC-LINK-DEBUG] sendEmail result=${JSON.stringify(result)}`);
  }

  return NextResponse.json({ ok: true });
}
