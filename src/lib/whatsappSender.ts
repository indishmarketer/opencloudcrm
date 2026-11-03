import { pool } from "@/lib/db";
import { SENDING_PURPOSES, type SendingPurpose } from "@/lib/whatsappSenderShape";

/** Which of the account's numbers the site sends from, per kind of message.
 *
 * It used to be whatever `WHATSAPP_PHONE_NUMBER_ID` pointed at, which meant
 * moving to a different number was an env change and a redeploy.
 *
 * Splitting it by kind is the point of having more than one number.
 * Marketing is what gets blocked and reported, and a number's quality
 * rating is what decides its daily limit -- so marketing can run from one
 * number while order confirmations and one-time codes, which people
 * actually want, keep going out from a number whose rating is protected.
 *
 * The kinds are Meta's own template categories rather than names we invent,
 * so routing needs no tagging by hand: every template already carries its
 * category, and Meta re-categorises templates whenever it disagrees. */

export * from "@/lib/whatsappSenderShape";

const SETTING_PREFIX = "whatsapp_sending_number";
/** The default kept its original key so the existing setting still applies. */
const settingKey = (purpose: SendingPurpose) =>
  purpose === "default" ? `${SETTING_PREFIX}_id` : `${SETTING_PREFIX}_${purpose}`;

/** Sends are rare but a campaign drain does 25 in a row; a few seconds of
 * cache saves a query per message without making a change feel stale. */
let cached: { map: Record<SendingPurpose, string | null>; expiresAt: number } | null = null;
const CACHE_MS = 15_000;

function envDefault(): string | null {
  return process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || null;
}

/** Every purpose and the number assigned to it. A purpose with nothing
 * assigned returns null and falls back to the default at send time. */
export async function sendingNumbers(): Promise<Record<SendingPurpose, string | null>> {
  if (cached && cached.expiresAt > Date.now()) return cached.map;

  const map = { default: envDefault(), marketing: null, utility: null, authentication: null } as Record<
    SendingPurpose,
    string | null
  >;
  try {
    const rows = await pool.query<{ key: string; value: string }>(
      "SELECT key, value FROM site_settings WHERE key LIKE $1",
      [`${SETTING_PREFIX}%`],
    );
    for (const purpose of SENDING_PURPOSES) {
      const value = rows.rows.find((row) => row.key === settingKey(purpose))?.value?.trim();
      if (value) map[purpose] = value;
    }
  } catch {
    // A database that cannot be read must not stop a transactional message
    // going out; the env var is a perfectly good answer.
  }
  cached = { map, expiresAt: Date.now() + CACHE_MS };
  return map;
}

export async function activeSendingNumberId(): Promise<string | null> {
  return (await sendingNumbers()).default;
}

/** The number for a template of this category, falling back to the default.
 * An unknown or missing category is treated as "everything else". */
export async function numberForTemplateCategory(category: string | null | undefined): Promise<string | null> {
  const map = await sendingNumbers();
  const purpose = (category || "").toLowerCase();
  if (purpose === "marketing" || purpose === "utility" || purpose === "authentication") {
    return map[purpose] || map.default;
  }
  return map.default;
}

export async function setSendingNumber(purpose: SendingPurpose, id: string | null): Promise<void> {
  if (!id) {
    // Only a non-default purpose can be cleared: something has to send.
    if (purpose === "default") return;
    await pool.query("DELETE FROM site_settings WHERE key = $1", [settingKey(purpose)]);
  } else {
    await pool.query(
      `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [settingKey(purpose), id.trim()],
    );
  }
  cached = null;
}

/** The number a reply has to go out from.
 *
 * Meta's 24-hour window belongs to the pair of numbers, not to the account,
 * so a reply sent from a different number than the one they messaged starts
 * a fresh conversation and is refused outside the window. Whatever the
 * defaults say, a thread answers from the number it arrived on. */
export async function replyFromNumberId(
  key: { kind: "contact"; contactId: number } | { kind: "phone"; digits: string },
): Promise<string | null> {
  const row = await pool.query<{ business_phone_number_id: string | null }>(
    key.kind === "contact"
      ? `SELECT business_phone_number_id FROM whatsapp_messages
         WHERE contact_id = $1 AND direction = 'inbound' AND business_phone_number_id IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`
      : `SELECT business_phone_number_id FROM whatsapp_messages
         WHERE contact_id IS NULL AND direction = 'inbound' AND business_phone_number_id IS NOT NULL
           AND regexp_replace(COALESCE(from_number, to_number), '\\D', '', 'g') = $1
         ORDER BY created_at DESC LIMIT 1`,
    [key.kind === "contact" ? key.contactId : key.digits],
  );
  return row.rows[0]?.business_phone_number_id ?? (await activeSendingNumberId());
}
