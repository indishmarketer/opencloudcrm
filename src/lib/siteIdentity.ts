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

declare global {
  // eslint-disable-next-line no-var
  var _lastKnownGoodSiteIdentity: SiteIdentity | undefined;
}

/** Server-only. Never throws: a missing table (migrations not run yet) or a
 * DB hiccup falls back to the last successfully read identity for this
 * process, not straight to the compiled-in placeholder -- a rolling deploy
 * briefly runs the old and new containers against the same DB, and a single
 * flaky query on the fresh container would otherwise flash the generic
 * default (e.g. "My Business") until the old container is torn down. Only a
 * container that has NEVER had a successful read (a truly fresh install)
 * falls all the way back to empty. */
export async function readSiteIdentity(): Promise<SiteIdentity> {
  try {
    const result = await pool.query<{ value: string }>("SELECT value FROM site_settings WHERE key = $1", [
      SITE_IDENTITY_KEY,
    ]);
    if (result.rows[0]) {
      const identity = normalizeSiteIdentity(JSON.parse(result.rows[0].value));
      global._lastKnownGoodSiteIdentity = identity;
      return identity;
    }
  } catch (error) {
    console.error("site identity: could not read from site_settings, using defaults.", error);
  }
  return global._lastKnownGoodSiteIdentity ? { ...global._lastKnownGoodSiteIdentity } : { ...EMPTY_SITE_IDENTITY };
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
