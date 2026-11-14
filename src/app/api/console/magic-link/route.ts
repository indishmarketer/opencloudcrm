import { NextRequest, NextResponse } from "next/server";
import { createMagicLinkToken } from "@/lib/auth";
import { isAuthorizedConsoleEmail } from "@/lib/consoleAdmins";
import { isEmailProviderConfigured } from "@/lib/email";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { checkRateLimit, privateRateLimitKey } from "@/lib/rateLimit";
import { requestOrigin } from "@/lib/requestOrigin";

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
  if (!(await checkRateLimit(`magic-link:${ip}`, ipLimit, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const { email } = await req.json();
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  const emailLimit = rateLimitEnv("MAGIC_LINK_EMAIL_RATE_LIMIT", 3);
  if (normalized && !(await checkRateLimit(`magic-link-email:${privateRateLimitKey(normalized)}`, emailLimit, 60 * 60 * 1000))) {
    return NextResponse.json({ ok: true });
  }

  // Always return the same generic response, whether or not the email is
  // authorized, so this endpoint can't be used to enumerate admin emails.
  if (normalized && (await isAuthorizedConsoleEmail(normalized))) {
    const token = await createMagicLinkToken(normalized);
    const link = `${requestOrigin(req)}/api/console/verify?token=${token}`;

    // No SES or Brevo configured yet: this is most likely a fresh deploy
    // with nobody able to log in at all otherwise (console login IS the
    // magic link -- see README.md), not just a routine missed send. Print
    // the real, usable link to the server's own logs (visible in Coolify's
    // Runtime Logs, same place deploy issues have already been diagnosed
    // from all session) instead of silently trying and failing to email
    // it. This pre-existing safety net is kept exactly as it was --
    // nothing about converting the normal path to an automation should be
    // able to lock an admin out of their own console.
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

    // Real, self-built automation now (trigger "Console login link
    // requested"). Add a condition on contact.email to restrict this to
    // one specific admin address if that's all you want it going to.
    emitWebhookEvent({
      eventType: "console_admin.login_link_requested",
      source: "console_admins",
      sourceRecordId: normalized,
      contactEmail: normalized,
      data: { link, email: normalized },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
