/** The addresses an individual console email may be sent from.
 *
 * A fixed list, not free text: SES only accepts identities verified for
 * this domain, and info@ is a receive-only inbox (see the comment in
 * src/lib/email.ts) so it must never appear as a From. Lives in its own
 * module so the picker in the console and the route that validates the
 * choice read the same list. */
import { SITE_URL } from "@/config/brand";

const EMAIL_DOMAIN = new URL(SITE_URL).hostname.replace(/^www\./, "");

export const SENDER_ADDRESSES = [
  { value: `support@${EMAIL_DOMAIN}`, label: "support@ — replies and help" },
  { value: `reach@${EMAIL_DOMAIN}`, label: "reach@ — outreach and newsletters" },
  { value: `academy@${EMAIL_DOMAIN}`, label: "academy@ — courses" },
] as const;

export const SENDER_VALUES: readonly string[] = SENDER_ADDRESSES.map((s) => s.value);
