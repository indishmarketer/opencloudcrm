import { NextRequest, NextResponse } from "next/server";
import { createMagicLinkToken } from "@/lib/auth";
import { isAuthorizedConsoleEmail } from "@/lib/consoleAdmins";
import { isEmailProviderConfigured, sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escapeHtml";
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

    // Console login cannot depend on a workflow or editable template.
    let delivered = false;
    if (isEmailProviderConfigured()) {
      try {
        const safeLink = escapeHtml(link);
        const sent = await sendEmail({
          to: normalized,
          subject: "Your console login link",
          html: `<p>Use this one-time link to log in to the console:</p><p><a href="${safeLink}">Log in to the console</a></p><p>This link expires in 15 minutes. If you did not request it, you can ignore this email.</p>`,
          category: "system",
          critical: true,
          trackOpens: false,
          trackClicks: false,
        });
        delivered = sent.ok && !sent.skipped;
      } catch (error) {
        console.error("Console login email failed:", error);
      }
    }

    // Existing bootstrap recovery path for an authorized admin when email
    // delivery is unavailable. The link is never returned to the browser.
    if (!delivered) {
      console.warn(
        `\n==================== CONSOLE LOGIN LINK ====================\n` +
        `The login email could not be delivered to ${normalized}.\n` +
        `Open this link directly to log in:\n\n` +
        `${link}\n\n` +
        `It expires in 15 minutes and is single-use.\n` +
        `==============================================================\n`
      );
    }
  }

  return NextResponse.json({ ok: true });
}
