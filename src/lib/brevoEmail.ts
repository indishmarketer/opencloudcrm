import { htmlToText } from "@/lib/htmlToText";
import { SITE_NAME } from "@/config/brand";

// Second supported email provider, alongside Amazon SES (sesEmail.ts) --
// same send interface, so email.ts can pick either one without the rest
// of the app caring which. Exists because a brand-new self-hoster often
// can't get SES production access (or any AWS account) working on day
// one, but can get a usable Brevo API key in minutes on its free tier --
// see README.md's Deployment section.

function headerSafe(value: string): string {
  return String(value).replace(/[\r\n\0]+/g, " ").trim();
}

function getApiKey(): string | null {
  return process.env.BREVO_API_KEY || null;
}

export type BrevoSendResult = { ok: true; messageId: string | null } | { ok: false; error: string };

/** Sends one email through Brevo's transactional email API (v3). Called
 * only from sendEmail() in email.ts, same as sendViaSes. */
export async function sendViaBrevo(opts: {
  to: string;
  subject: string;
  html: string;
  from: string;
  replyTo: string;
  listUnsubscribe: string;
  listUnsubscribePost: string;
  attachments?: { name: string; content: string }[];
}): Promise<BrevoSendResult> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: "Brevo API key not configured" };

  const body = {
    sender: { name: SITE_NAME, email: headerSafe(opts.from) },
    to: [{ email: headerSafe(opts.to) }],
    replyTo: { email: headerSafe(opts.replyTo) },
    subject: headerSafe(opts.subject),
    htmlContent: opts.html,
    textContent: htmlToText(opts.html),
    headers: {
      "List-Unsubscribe": `<${headerSafe(opts.listUnsubscribe)}>`,
      "List-Unsubscribe-Post": headerSafe(opts.listUnsubscribePost),
    },
    ...(opts.attachments?.length
      ? { attachment: opts.attachments.map((a) => ({ name: a.name, content: a.content })) }
      : {}),
  };

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const message = `Brevo ${res.status}: ${text}`.slice(0, 500);
      console.error("Brevo send failed:", message);
      return { ok: false, error: message };
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, messageId: data.messageId ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Brevo send failed";
    console.error("Brevo send failed:", message);
    return { ok: false, error: message };
  }
}

export type BrevoAccountHealth = { ok: true } | { ok: false; error: string };

/** Lightweight "is this key valid" check (GET /account), mirroring
 * getSesAccountHealth's role -- Brevo's REST API doesn't expose the same
 * send-quota/reputation detail SES does, so this only confirms the key
 * itself works, not sending health. */
export async function getBrevoAccountHealth(): Promise<BrevoAccountHealth> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: "Brevo not configured" };
  try {
    const res = await fetch("https://api.brevo.com/v3/account", {
      headers: { "api-key": apiKey, Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, error: `Brevo ${res.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Brevo account check failed" };
  }
}
