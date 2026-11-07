/** Owner-controlled additions to robots.txt and sitemap.xml, on top of the
 * built-in rules in src/app/robots.ts and src/app/sitemap.ts. Edited from
 * /console/site-actions, stored as one JSON value in site_settings (key
 * SITE_CRAWL_SETTINGS_KEY).
 *
 * Deliberately additive only: the console can add extra Disallow/Allow
 * lines and extra sitemap URLs, but can never remove or override the
 * paths robots.ts already hard-blocks (console, account, password reset,
 * the API, private community/webinar areas) -- those protect every
 * deployment's privacy, not just this one's content. normalizeCrawlSettings
 * strips out anything that would touch a protected path, so a bad save
 * here can't make /console crawlable.
 *
 * No imports on purpose: safe for client components and plain node tests.
 * The DB read/write lives in src/lib/siteCrawlSettings.ts. */

export const SITE_CRAWL_SETTINGS_KEY = "site_crawl_settings";

/** Kept in sync by hand with the `disallow` array in src/app/robots.ts --
 * every entry there (minus the trailing-slash duplicates) listed as a
 * prefix. An extra rule whose path starts with one of these is dropped. */
export const PROTECTED_PATH_PREFIXES = [
  "/console",
  "/account",
  "/reset-password",
  "/verify-email",
  "/forgot-password",
  "/community/pro",
  "/community/admin",
  "/community/settings",
  "/community/messages",
  "/api/",
  "/book/manage",
];

export type SiteCrawlSettings = {
  /** Extra "Disallow:" paths, on top of the built-in protected list. */
  robotsExtraDisallow: string[];
  /** Extra "Allow:" paths -- for re-opening a narrow part of a path the
   * owner themselves disallowed above, not a protected one. */
  robotsExtraAllow: string[];
  /** Extra site-relative paths merged into sitemap.xml, for pages outside
   * the page builder / course / blog / tool generators that already feed
   * it. To remove something the generator already includes, use that
   * page's own "noindex" setting instead of a second list here. */
  sitemapExtraUrls: string[];
};

export const EMPTY_SITE_CRAWL_SETTINGS: SiteCrawlSettings = {
  robotsExtraDisallow: [],
  robotsExtraAllow: [],
  sitemapExtraUrls: [],
};

const MAX_ENTRIES = 50;
const MAX_LENGTH = 200;

function isProtected(path: string): boolean {
  const lower = path.toLowerCase();
  return PROTECTED_PATH_PREFIXES.some((p) => lower === p || lower.startsWith(p.endsWith("/") ? p : `${p}/`) || lower === p.replace(/\/$/, ""));
}

/** One path per line, "/"-prefixed, deduped, capped, and stripped of
 * anything that would touch a protected path. */
function normalizePathList(input: unknown): string[] {
  const raw = typeof input === "string" ? input.split("\n") : Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    let path = entry.trim().slice(0, MAX_LENGTH);
    if (!path) continue;
    if (!path.startsWith("/")) path = `/${path}`;
    if (isProtected(path)) continue;
    seen.add(path);
    if (seen.size >= MAX_ENTRIES) break;
  }
  return [...seen];
}

export function normalizeCrawlSettings(input: unknown): SiteCrawlSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    robotsExtraDisallow: normalizePathList(raw.robotsExtraDisallow),
    robotsExtraAllow: normalizePathList(raw.robotsExtraAllow),
    sitemapExtraUrls: normalizePathList(raw.sitemapExtraUrls),
  };
}

/** Renders the extra lines as text, one per line, for the console's
 * textareas (the inverse of the split in normalizePathList). */
export function pathListToText(paths: string[]): string {
  return paths.join("\n");
}
