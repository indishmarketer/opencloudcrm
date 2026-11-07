import { cache } from "react";
import { pool } from "@/lib/db";
import {
  EMPTY_SITE_CRAWL_SETTINGS,
  SITE_CRAWL_SETTINGS_KEY,
  normalizeCrawlSettings,
  type SiteCrawlSettings,
} from "@/lib/siteCrawlSettingsShape";

export type { SiteCrawlSettings } from "@/lib/siteCrawlSettingsShape";

/** Server-only. Never throws: a missing table or a DB hiccup during
 * `next build` falls back to no extra rules, so robots.txt/sitemap.xml are
 * never broken by this. */
export async function readCrawlSettings(): Promise<SiteCrawlSettings> {
  try {
    const result = await pool.query<{ value: string }>("SELECT value FROM site_settings WHERE key = $1", [
      SITE_CRAWL_SETTINGS_KEY,
    ]);
    if (result.rows[0]) return normalizeCrawlSettings(JSON.parse(result.rows[0].value));
  } catch (error) {
    console.error("site crawl settings: could not read from site_settings, using defaults.", error);
  }
  return { ...EMPTY_SITE_CRAWL_SETTINGS };
}

/** Deduplicated per request -- robots.ts and sitemap.ts both ask. */
export const getCrawlSettings = cache(readCrawlSettings);

export async function saveCrawlSettings(settings: SiteCrawlSettings): Promise<void> {
  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [SITE_CRAWL_SETTINGS_KEY, JSON.stringify(settings)]
  );
}
