import { cache } from "react";
import { pool } from "@/lib/db";
import {
  DEFAULT_SITE_CHROME,
  SITE_CHROME_KEY,
  normalizeSiteChrome,
  type SiteChrome,
} from "@/lib/siteChromeShape";

export type { SiteChrome } from "@/lib/siteChromeShape";

/** Social links used to be NEXT_PUBLIC_SOCIAL_* env vars. Until the
 * navigation is saved once from the console, those still show. */
function legacySocialsFromEnv(): SiteChrome["socials"] {
  const socials: SiteChrome["socials"] = {};
  if (process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK) socials.facebook = process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK;
  if (process.env.NEXT_PUBLIC_SOCIAL_X) socials.x = process.env.NEXT_PUBLIC_SOCIAL_X;
  if (process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE) socials.youtube = process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE;
  if (process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN) socials.linkedin = process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN;
  return socials;
}

/** Server-only. Never throws -- falls back to the defaults if the table is
 * missing or the DB is unreachable (e.g. during `next build`). */
export async function readSiteChrome(): Promise<{ chrome: SiteChrome; saved: boolean }> {
  try {
    const result = await pool.query<{ value: string }>("SELECT value FROM site_settings WHERE key = $1", [SITE_CHROME_KEY]);
    if (result.rows[0]) return { chrome: normalizeSiteChrome(JSON.parse(result.rows[0].value)), saved: true };
  } catch (error) {
    console.error("site chrome: could not read from site_settings, using defaults.", error);
  }
  return { chrome: { ...DEFAULT_SITE_CHROME, socials: legacySocialsFromEnv() }, saved: false };
}

export const getSiteChrome = cache(async (): Promise<SiteChrome> => (await readSiteChrome()).chrome);

export async function saveSiteChrome(chrome: SiteChrome): Promise<void> {
  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [SITE_CHROME_KEY, JSON.stringify(chrome)]
  );
}
