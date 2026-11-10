import { cache } from "react";
import { pool } from "@/lib/db";
import {
  EMPTY_EMAIL_SETTINGS,
  EMAIL_SETTINGS_KEY,
  normalizeEmailSettings,
  type EmailSettings,
} from "@/lib/emailSettingsShape";

export type { EmailSettings } from "@/lib/emailSettingsShape";

declare global {
  // eslint-disable-next-line no-var
  var _lastKnownGoodEmailSettings: EmailSettings | undefined;
}

/** Server-only. Never throws: a missing table or a DB hiccup falls back to
 * the last successfully read settings for this process (see siteIdentity.ts
 * for why), not straight to "no custom domain" -- a rolling deploy briefly
 * runs old and new containers against the same DB. Only a container that has
 * never had a successful read falls back to the empty default. */
export async function readEmailSettings(): Promise<EmailSettings> {
  try {
    const result = await pool.query<{ value: string }>("SELECT value FROM site_settings WHERE key = $1", [
      EMAIL_SETTINGS_KEY,
    ]);
    if (result.rows[0]) {
      const settings = normalizeEmailSettings(JSON.parse(result.rows[0].value));
      global._lastKnownGoodEmailSettings = settings;
      return settings;
    }
  } catch (error) {
    console.error("email settings: could not read from site_settings, using defaults.", error);
  }
  return global._lastKnownGoodEmailSettings ? { ...global._lastKnownGoodEmailSettings } : { ...EMPTY_EMAIL_SETTINGS };
}

/** Deduplicated per request. */
export const getEmailSettings = cache(readEmailSettings);

export async function saveEmailSettings(settings: EmailSettings): Promise<void> {
  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [EMAIL_SETTINGS_KEY, JSON.stringify(settings)]
  );
}

/** The domain outgoing mail sends from: the console-configured override, or
 * this deployment's own site domain when none is set. */
export async function resolveEmailDomain(fallbackHostname: string): Promise<string> {
  const settings = await getEmailSettings();
  return settings.sendingDomain || fallbackHostname;
}
