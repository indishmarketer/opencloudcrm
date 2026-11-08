import { SITE_URL as FROZEN_SITE_URL } from "@/config/brand";

/** Server-only live SITE_URL.
 *
 * config/brand.ts's SITE_URL reads NEXT_PUBLIC_SITE_URL, which Next.js
 * inlines into both the client bundle and the server build artifact at
 * `next build` time -- on the project's generic self-host image that
 * build runs in CI with no deployment-specific config, so it's frozen to
 * the placeholder "https://example.com" forever, for every self-hoster,
 * no matter what they set at runtime (same class of bug already fixed
 * for ASSET_DOMAIN in proxy.ts). This reads a bare SITE_URL env var
 * instead, evaluated once when the server process actually starts (i.e.
 * live, per deployment), falling back to the frozen value if unset --
 * for every server-only consumer that builds a URL (canonical links, OG
 * tags, JSON-LD, the sitemap, emails). Never import this from a
 * "use client" file; those still need config/brand's NEXT_PUBLIC_SITE_URL,
 * since only that one is available in the browser at all. */
export const SITE_URL = process.env.SITE_URL || FROZEN_SITE_URL;

export const SITE_HOSTNAME = new URL(SITE_URL).hostname.replace(/^www\./, "");

/** Live counterpart to config/brand's emailAt() -- see its own comment. */
export function emailAt(local: string): string {
  return `${local}@${SITE_HOSTNAME}`;
}
