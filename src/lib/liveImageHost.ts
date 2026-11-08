import { ASSET_DOMAIN, SITE_URL } from "@/config/brand";

/** next/image only optimizes hosts listed in next.config.ts's
 * images.remotePatterns and 400s on any other -- and that config, like
 * Content-Security-Policy (see src/proxy.ts), gets serialized into the
 * standalone build at image-build time rather than re-read from the
 * environment at container startup. On the project's own published
 * self-host image that freezes remotePatterns to brand.ts's
 * "images.example.com" default forever, so any real externally-hosted
 * image (course covers, trainer avatars, uploaded content) 400s from
 * /_next/image with no visible error beyond a missing picture.
 *
 * Unlike the CSP fix, this one deliberately checks against the SAME
 * frozen NEXT_PUBLIC_ASSET_DOMAIN/NEXT_PUBLIC_SITE_URL values
 * remotePatterns itself was built from (matching the existing pattern in
 * src/components/pageBlocks/BlockImage.tsx), not a live env var -- the
 * two configs are frozen *together*, at the same build, so checking
 * against the frozen value and the frozen allowlist always agree:
 *   - generic published image: both frozen to images.example.com, so a
 *     real image's host never matches -> unoptimized, safely bypassing
 *     the broken allowlist.
 *   - a self-built image with the real NEXT_PUBLIC_ASSET_DOMAIN set
 *     correctly: both get the real value baked in together, so a real
 *     image's host DOES match -> Next's optimizer actually runs.
 * Checking against a live env var instead (what this file originally
 * did) breaks exactly the case that matters: it would recognize the
 * real host as "known" and send it through the optimizer anyway, which
 * still 400s because remotePatterns didn't get the memo. */
const OPTIMIZABLE_HOSTS = new Set([ASSET_DOMAIN, new URL(SITE_URL).hostname, "i.ytimg.com"]);

export function isKnownImageHost(src: string): boolean {
  if (src.startsWith("/")) return true;
  try {
    return OPTIMIZABLE_HOSTS.has(new URL(src).hostname);
  } catch {
    return false;
  }
}
