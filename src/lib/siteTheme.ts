import { cache } from "react";
import { pool } from "@/lib/db";
import {
  DEFAULT_SITE_THEME,
  SITE_THEME_KEY,
  normalizeSiteTheme,
  type SiteTheme,
} from "@/lib/siteThemeShape";

export type { SiteTheme, Gradient } from "@/lib/siteThemeShape";
export { gradientCss, siteThemeCss, DEFAULT_SITE_THEME } from "@/lib/siteThemeShape";

declare global {
  // eslint-disable-next-line no-var
  var _lastKnownGoodSiteTheme: SiteTheme | undefined;
}

/** Server-only. Never throws: a missing table (migrations not run yet) or a
 * DB hiccup falls back to the last successfully read theme for this
 * process, not straight to the compiled-in default -- same rolling-deploy
 * safety reasoning as readSiteIdentity. Only a container that has never
 * had a successful read falls all the way back to DEFAULT_SITE_THEME,
 * which is the exact palette this site shipped with before this feature
 * existed, so that fallback is itself always visually safe. */
export async function readSiteTheme(): Promise<SiteTheme> {
  try {
    const result = await pool.query<{ value: string }>("SELECT value FROM site_settings WHERE key = $1", [SITE_THEME_KEY]);
    if (result.rows[0]) {
      const theme = normalizeSiteTheme(JSON.parse(result.rows[0].value));
      global._lastKnownGoodSiteTheme = theme;
      return theme;
    }
  } catch (error) {
    console.error("site theme: could not read from site_settings, using defaults.", error);
  }
  return global._lastKnownGoodSiteTheme ? { ...global._lastKnownGoodSiteTheme } : { ...DEFAULT_SITE_THEME };
}

/** Deduplicated per request, so the layout and the design-system MCP tool
 * can both ask without a second DB round trip. */
export const getSiteTheme = cache(readSiteTheme);

export async function saveSiteTheme(partial: unknown): Promise<SiteTheme> {
  const current = await readSiteTheme();
  const next = normalizeSiteTheme(partial, current);
  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [SITE_THEME_KEY, JSON.stringify(next)]
  );
  return next;
}
