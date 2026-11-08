import { NextRequest } from "next/server";

/** The published self-host image bakes NEXT_PUBLIC_SITE_URL in at the
 * generic image's own build time (empty, since no deployment-specific
 * value exists yet then) -- every webpack-compiled reference to it,
 * server-side included, is frozen to brand.ts's "https://example.com"
 * fallback forever on that image, with no runtime env var able to
 * override it (see docker-compose.yml's "Brand" section and the
 * Dockerfile's ARG/ENV pairs for NEXT_PUBLIC_*). An absolute URL built
 * from SITE_URL is therefore wrong on every self-host using that image.
 * Derive the origin from the actual incoming request instead, so it
 * always points at whatever domain really served it. */
export function requestOrigin(req: NextRequest): string {
  const host = req.headers.get("host") || req.nextUrl.hostname;
  const protocol = req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:" ? "https" : "http";
  return `${protocol}://${host}`;
}
