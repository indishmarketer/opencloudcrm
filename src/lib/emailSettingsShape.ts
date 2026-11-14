/** Which domain outgoing mail claims to be sent from. Edited from
 * /console/email/sending, stored as one JSON value in site_settings
 * (key EMAIL_SETTINGS_KEY).
 *
 * An empty sendingDomain means "use this deployment's own site domain" --
 * the historical, zero-config behavior. Setting a custom domain here does
 * NOT verify it or configure DNS/DKIM: it only changes which domain the
 * provider (SES/Brevo) is told to send as, so a domain entered here must
 * already be verified with whichever provider this deployment uses, or
 * sends will fail/land in spam.
 *
 * No imports on purpose: safe for client components and plain node tests.
 * The DB read/write lives in src/lib/emailSettings.ts. */

export const EMAIL_SETTINGS_KEY = "email_settings";

export type EmailSettings = {
  sendingDomain: string;
  /** The branded header strip + accent line wrapEmailHtml() adds above
   * every email's content. Off by default for nobody -- existing
   * deployments keep what they have unless they turn it off. */
  brandingEnabled: boolean;
  brandingAlign: "left" | "center";
  brandingAccentColor: string;
  brandingBackgroundColor: string;
};

export const EMPTY_EMAIL_SETTINGS: EmailSettings = {
  sendingDomain: "",
  brandingEnabled: true,
  brandingAlign: "left",
  brandingAccentColor: "#dc2626",
  brandingBackgroundColor: "#f4f1ec",
};

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;
const HEX_RE = /^#[0-9a-f]{6}$/i;

export function normalizeEmailSettings(input: unknown): EmailSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const domain = typeof raw.sendingDomain === "string" ? raw.sendingDomain.trim().toLowerCase().slice(0, 253) : "";
  const accent = typeof raw.brandingAccentColor === "string" && HEX_RE.test(raw.brandingAccentColor)
    ? raw.brandingAccentColor : EMPTY_EMAIL_SETTINGS.brandingAccentColor;
  const background = typeof raw.brandingBackgroundColor === "string" && HEX_RE.test(raw.brandingBackgroundColor)
    ? raw.brandingBackgroundColor : EMPTY_EMAIL_SETTINGS.brandingBackgroundColor;
  return {
    sendingDomain: domain,
    brandingEnabled: typeof raw.brandingEnabled === "boolean" ? raw.brandingEnabled : true,
    brandingAlign: raw.brandingAlign === "center" ? "center" : "left",
    brandingAccentColor: accent,
    brandingBackgroundColor: background,
  };
}

/** Returns a human-readable error, or null if the settings can be saved. */
export function validateEmailSettings(settings: EmailSettings): string | null {
  if (settings.sendingDomain && !DOMAIN_RE.test(settings.sendingDomain)) {
    return "Enter a valid domain, like mail.example.com.";
  }
  return null;
}
