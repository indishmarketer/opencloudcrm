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
export const SITE_NAME = "Indish Marketer";
export const SITE_URL = "https://indishmarketer.com";
// Hardcoded for the same reason SITE_NAME and SITE_URL above are, and it
// was simply left behind when they were done. As a NEXT_PUBLIC_* var it is
// inlined at `next build`, and the publish workflow passes no build args,
// so every production image froze this at "images.example.com" -- a domain
// that does not resolve. Everything assetUrl() built pointed there: the
// newsletter's og:image, the organisation logo in the JSON-LD, the
// site-wide default share image. It also fed next.config.ts's
// images.remotePatterns and liveImageHost's allowlist, so next/image was
// refusing to optimise the real asset host as well.
export const ASSET_DOMAIN = "images.indishmarketer.com";
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
