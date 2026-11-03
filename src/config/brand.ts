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

/** The site's color palette (src/app/globals.css's own :root values are the
 * defaults below -- these env vars just let a deployment override them
 * without touching source, the same way SITE_NAME/SITE_URL do for brand
 * identity). Applied in the root layout as a :root style override. */
export const COLOR_INK = process.env.NEXT_PUBLIC_COLOR_INK || "#0a0a0a";
export const COLOR_PAPER = process.env.NEXT_PUBLIC_COLOR_PAPER || "#ffffff";
export const COLOR_PAPER_SOFT = process.env.NEXT_PUBLIC_COLOR_PAPER_SOFT || "#f5f5f4";
export const COLOR_INK_SOFT = process.env.NEXT_PUBLIC_COLOR_INK_SOFT || "#4b4b4b";
export const COLOR_LINE = process.env.NEXT_PUBLIC_COLOR_LINE || "#e2e2e0";

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
