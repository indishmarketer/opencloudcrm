/** The published self-host image bakes NEXT_PUBLIC_SITE_URL in at the
 * generic image's own build time (empty, since no deployment-specific
 * value exists yet then) -- every webpack-compiled reference to it,
 * server-side included, is frozen to brand.ts's "https://example.com"
 * fallback forever on that image, with no runtime env var able to
 * override it (see docker-compose.yml's "Brand" section and the
 * Dockerfile's ARG/ENV pairs for NEXT_PUBLIC_*). An absolute URL built
 * from SITE_URL is therefore wrong on every self-host using that image.
 *
 * Plain `req.url` has the same problem for a different reason: behind a
 * TLS-terminating reverse proxy (Traefik, the Coolify default) the
 * connection Node actually sees is plain HTTP, so req.url's own scheme
 * reports "http:" even though the browser's real request was "https:" --
 * breaking any same-origin check that compares it against the browser's
 * Origin header (see isSameOriginPost in src/lib/auth.ts). x-forwarded-proto
 * is what the proxy sets to say what the original request really was.
 *
 * Takes a plain Request (not NextRequest) so src/lib/auth.ts's
 * isSameOriginPost, called with the Request Next.js route handlers
 * receive, can reuse this directly. */
export function requestOrigin(req: Request): string {
  const host = req.headers.get("host") || new URL(req.url).hostname;
  const protocol = req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:" ? "https" : "http";
  return `${protocol}://${host}`;
}
