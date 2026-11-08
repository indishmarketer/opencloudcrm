import { headers } from "next/headers";

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
 * There's no per-request hook into Next's image-optimization route the
 * way middleware/proxy provides for headers, so the fix is the same one
 * src/components/pageBlocks/BlockImage.tsx already uses for page-builder
 * content: skip Next's optimizer (render a plain <img> instead, via the
 * `unoptimized` prop) for any host that isn't a known safe one.
 * ASSET_DOMAIN (not NEXT_PUBLIC_ASSET_DOMAIN) is read live for the same
 * reason as src/proxy.ts's CSP fix -- Next.js inlines every
 * NEXT_PUBLIC_* reference into the compiled bundle at build time, which
 * would freeze this check exactly the same way remotePatterns itself is
 * frozen.
 *
 * Call getLiveImageHosts() once per request/page (it needs headers(),
 * which is async) and pass the result into isKnownImageHost() for each
 * individual <Image>, rather than awaiting per-image -- cheaper, and
 * avoids async work inside a .map() over a list of images. */
export async function getLiveImageHosts(): Promise<Set<string>> {
  const h = await headers();
  const requestHost = (h.get("host") || "").split(":")[0];
  const assetDomain = process.env.ASSET_DOMAIN || "images.example.com";
  return new Set([assetDomain, requestHost, "i.ytimg.com"]);
}

export function isKnownImageHost(src: string, knownHosts: Set<string>): boolean {
  if (src.startsWith("/")) return true;
  try {
    return knownHosts.has(new URL(src).hostname);
  } catch {
    return false;
  }
}
