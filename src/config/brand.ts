/**
 * Deployment-level site identity: name, URL, asset domain, socials. These
 * are build-time values (NEXT_PUBLIC_*, inlined into the client bundle).
 *
 * src/lib/siteMeta.ts re-exports from here so existing imports keep
 * working unchanged.
 */

// NEXT_PUBLIC_* vars are read as literal `process.env.NEXT_PUBLIC_X` member
// expressions (never a dynamic lookup) so Next.js can statically inline them
// if this module is ever pulled into client-bundled code.
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "My Business";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";
export const ASSET_DOMAIN = process.env.NEXT_PUBLIC_ASSET_DOMAIN || "images.example.com";
export const OG_LOCALE = "en_US";

// The color palette used to live here as NEXT_PUBLIC_COLOR_* env vars,
// frozen into the image at CI build time like every other NEXT_PUBLIC_*
// value -- meaning no self-hoster's own value for them ever actually took
// effect. It's now a live, DB-backed theme instead: see
// src/lib/siteTheme.ts (read) and Console -> Site Settings -> Theme (edit).

/** WhatsApp/Facebook's crawler caches a page's og:image by that image's
 * exact URL -- if the URL never changes, editing the file in place doesn't
 * make the crawler refetch it, even indefinitely. Bump this whenever the
 * shared sitewide default OG image (brand/og-default.png) is regenerated,
 * so every page that inherits it gets treated as a fresh image. */
export const OG_ASSET_VERSION = "2";

export function assetUrl(path: string): string {
  return `https://${ASSET_DOMAIN}/${path}`;
}

export const SITE_HOSTNAME = new URL(SITE_URL).hostname.replace(/^www\./, "");

/** Builds a mailbox address on the site's own domain, e.g. emailAt("support")
 * -> "support@example.com" (or whatever domain this deployment sets via
 * NEXT_PUBLIC_SITE_URL). Used for the handful of branded sender/reply
 * addresses (support@, academy@, reach@...) scattered through email sending
 * code -- the mailbox name is an app concern, the domain is a brand-identity
 * one. */
export function emailAt(local: string): string {
  return `${local}@${SITE_HOSTNAME}`;
}

// Social links, like the business identity below, are page content: edited
// from /console/pages (Navigation) and read with getSiteChrome().

// The business identity (owner, address, phone, registration number...)
// is NOT here: it's page content, edited from /console/site-settings and
// read with getBusiness() from src/lib/businessProfile.ts.
