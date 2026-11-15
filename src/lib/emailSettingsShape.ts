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

/** What each kind of email is for. Each is sent from one of the
 * deployment's usernames at the sending domain (e.g. support@…). */
export const SENDER_PURPOSES = [
  { key: "transactional", label: "Transactional (account, security, receipts)" },
  { key: "marketing", label: "Marketing (campaigns, newsletters)" },
  { key: "courses", label: "Courses" },
  { key: "directory", label: "Tools directory" },
  { key: "reviews", label: "Reviews" },
] as const;
export type SenderPurpose = (typeof SENDER_PURPOSES)[number]["key"];

export type EmailSettings = {
  sendingDomain: string;
  /** The part before the @, e.g. "support", "hello". */
  usernames: string[];
  /** Which username each purpose sends from. Empty = the first username. */
  senders: Record<SenderPurpose, string>;
};

const EMPTY_SENDERS: Record<SenderPurpose, string> = { transactional: "", marketing: "", courses: "", directory: "", reviews: "" };
export const EMPTY_EMAIL_SETTINGS: EmailSettings = { sendingDomain: "", usernames: ["support"], senders: { ...EMPTY_SENDERS } };

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

export function normalizeEmailSettings(input: unknown): EmailSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const domain = typeof raw.sendingDomain === "string" ? raw.sendingDomain.trim().toLowerCase().slice(0, 253) : "";
  const usernames = Array.isArray(raw.usernames)
    ? Array.from(new Set(raw.usernames.filter((u): u is string => typeof u === "string").map((u) => u.trim().toLowerCase()).filter(Boolean))).slice(0, 20)
    : [...EMPTY_EMAIL_SETTINGS.usernames];
  const rawSenders = raw.senders && typeof raw.senders === "object" ? (raw.senders as Record<string, unknown>) : {};
  const senders = { ...EMPTY_SENDERS };
  for (const { key } of SENDER_PURPOSES) {
    const value = typeof rawSenders[key] === "string" ? (rawSenders[key] as string).trim().toLowerCase() : "";
    senders[key] = usernames.includes(value) ? value : "";
  }
  return { sendingDomain: domain, usernames, senders };
}

/** The full from-address for a kind of email. */
export function senderAddress(settings: EmailSettings, purpose: SenderPurpose, domain: string): string {
  const username = settings.senders[purpose] || settings.usernames[0] || "support";
  return `${username}@${domain}`;
}

/** Returns a human-readable error, or null if the settings can be saved. */
export function validateEmailSettings(settings: EmailSettings): string | null {
  if (settings.sendingDomain && !DOMAIN_RE.test(settings.sendingDomain)) {
    return "Enter a valid domain, like mail.example.com.";
  }
  const bad = settings.usernames.find((u) => !USERNAME_RE.test(u));
  if (bad) return `"${bad}" can't be used as an email username. Use letters, numbers, dots, dashes or underscores.`;
  if (!settings.usernames.length) return "Add at least one username, like support.";
  return null;
}
