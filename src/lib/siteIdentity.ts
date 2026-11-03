import { cache } from "react";
import { pool } from "@/lib/db";
import { SITE_NAME } from "@/config/brand";
import {
  EMPTY_SITE_IDENTITY,
  SITE_IDENTITY_KEY,
  normalizeSiteIdentity,
  type SiteIdentity,
} from "@/lib/siteIdentityShape";

export type { SiteIdentity } from "@/lib/siteIdentityShape";

/** Server-only. Never throws: a missing table (migrations not run yet) or a
 * DB hiccup during `next build` falls back to an empty identity, so a page
 * render is never broken by the site's branding. */
export async function readSiteIdentity(): Promise<SiteIdentity> {
  try {
    const result = await pool.query<{ value: string }>("SELECT value FROM site_settings WHERE key = $1", [
      SITE_IDENTITY_KEY,
    ]);
    if (result.rows[0]) return normalizeSiteIdentity(JSON.parse(result.rows[0].value));
  } catch (error) {
    console.error("site identity: could not read from site_settings, using defaults.", error);
  }
  return { ...EMPTY_SITE_IDENTITY };
}

/** Deduplicated per request, so the layout, nav and footer can all ask. */
export const getSiteIdentity = cache(readSiteIdentity);

/** The name to show: the console-saved name, else the compiled-in default. */
export function resolveSiteName(identity: SiteIdentity): string {
  return identity.name || SITE_NAME;
}

export async function saveSiteIdentity(identity: SiteIdentity): Promise<void> {
  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [SITE_IDENTITY_KEY, JSON.stringify(identity)]
  );
}
