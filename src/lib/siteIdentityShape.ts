/** The site's outward identity: its name, the default browser-tab title,
 * the meta description, and the logo/favicon/social images. Edited from
 * /console/site-settings (Site identity tab), stored as one JSON value in
 * site_settings (key SITE_IDENTITY_KEY).
 *
 * Everything is optional. An empty string means "keep the built-in default"
 * (the NEXT_PUBLIC_SITE_NAME / brand assets compiled into the app), so a
 * fresh install still looks right before anyone saves anything.
 *
 * No imports on purpose: safe for client components and plain node tests.
 * The DB read/write lives in src/lib/siteIdentity.ts. */

export const SITE_IDENTITY_KEY = "site_identity";

export type SiteIdentity = {
  /** Site name, shown in the header/footer and as the fallback title. */
  name: string;
  /** The default <title> (browser tab). Blank falls back to `name`. */
  metaTitle: string;
  /** The default <meta name="description"> for the whole site. */
  description: string;
  /** Image logo URL. Blank shows the site name as a text logo. */
  logoUrl: string;
  /** Favicon URL. Blank keeps the app's own favicon/icon files. */
  faviconUrl: string;
  /** Social share image. Blank keeps the built-in default OG image. */
  ogImageUrl: string;
};

export const EMPTY_SITE_IDENTITY: SiteIdentity = {
  name: "",
  metaTitle: "",
  description: "",
  logoUrl: "",
  faviconUrl: "",
  ogImageUrl: "",
};

const str = (value: unknown, limit = 300) => (typeof value === "string" ? value.trim().slice(0, limit) : "");

/** Absolute http(s) URLs or site-relative paths only -- never javascript: or
 * data:, since these render as <link> hrefs / <img> srcs. */
function imageUrl(value: unknown): string {
  const url = str(value, 1000);
  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return "";
}

export function normalizeSiteIdentity(input: unknown): SiteIdentity {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    name: str(raw.name, 60),
    metaTitle: str(raw.metaTitle, 120),
    description: str(raw.description, 300),
    logoUrl: imageUrl(raw.logoUrl),
    faviconUrl: imageUrl(raw.faviconUrl),
    ogImageUrl: imageUrl(raw.ogImageUrl),
  };
}
