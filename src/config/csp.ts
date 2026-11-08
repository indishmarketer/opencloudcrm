import { SITE_HOSTNAME, ASSET_DOMAIN } from "./brand";

/** The site's Content-Security-Policy, in one place.
 *
 * It lives here rather than inline in next.config.ts because three very
 * different callers need the same answer: src/middleware.ts, which turns
 * it into the actual response header on every request; next.config.ts's
 * images.remotePatterns, which needs the same asset/site hosts for
 * next/image; and src/lib/designSystem.ts, which reports the allowed
 * hosts to an API/MCP client about to hand-write a page section. A client
 * that builds a section around a script, font or image host this policy
 * blocks gets no error -- just a feature that silently does nothing -- so
 * the list it is told has to be the list actually being enforced, not a
 * copy that drifted.
 *
 * Imported by next.config.ts, so: no "@/" path aliases (the config is
 * evaluated outside the app's module resolution) and no server-only
 * imports.
 *
 * buildCspDirectives() takes assetOrigin/siteWww as PARAMETERS rather
 * than reading them from brand.ts's NEXT_PUBLIC_* exports directly --
 * those are inlined into the compiled bundle at image-build time
 * (confirmed live: next.config.ts's own async headers()/images config
 * turned out to ALSO get serialized into the standalone build's
 * manifest at build time, not re-read fresh at container startup, despite
 * looking like ordinary Node.js code that should have live process.env
 * access). On the project's own published self-host image -- built once
 * generically, with no deployment-specific values -- that freezes this
 * policy to the brand.ts defaults forever, silently breaking every image
 * whose real host isn't "images.example.com". middleware.ts calls
 * buildCspDirectives() with host info read from the actual incoming
 * request (always live, same technique as src/lib/requestOrigin.ts) plus
 * ASSET_ORIGIN, a plain (non-NEXT_PUBLIC_) env var that Next.js never
 * inlines, so it's live from a Coolify-set runtime value even on the
 * generic image with no rebuild required. */
export function buildCspDirectives(assetOrigin: string, siteWww: string): string[] {
  return [
    "default-src 'self'",
    // No sentry-cdn.com entry needed: Sentry is loaded from our own bundle
    // (@sentry/nextjs) and events go out through /api/monitoring, not a
    // direct browser request to Sentry's domains.
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://challenges.cloudflare.com https://static.cloudflareinsights.com https://checkout.razorpay.com https://cdn.razorpay.com https://www.paypal.com https://www.paypalobjects.com",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    // image.mux.com: Mux-hosted webinar thumbnails.
    // The trailing hosts are the "Featured on" badges, every one hotlinked
    // from the directory that issued it. They re-check our homepage for their
    // own domain and pull the listing if it stops appearing, so a local copy
    // is not an option (see src/data/listings.ts). **Every new badge needs its
    // host added here**, or the CSP blocks the image and it renders broken
    // with no other symptom. easylaunch.dev appears twice because its apex
    // redirects to www and the snippet embeds the apex.
    `img-src 'self' data: ${assetOrigin} ${siteWww} https://images.pexels.com https://www.google-analytics.com https://c.bing.com https://www.facebook.com https://i.ytimg.com https://www.paypalobjects.com https://image.mux.com https://cdn.razorpay.com https://launchfree.io https://www.listbulb.com https://easylaunch.dev https://www.easylaunch.dev https://bricklaun.ch https://api.producthunt.com https://verifieddr.com https://easydofollow.dev https://www.easydofollow.dev https://launchbuff.com https://lemonlaunch.dev`,
    "font-src 'self' data:",
    // blob: + *.mux.com: Mux Player/hls.js fetch HLS manifests/segments from
    // *.mux.com and buffer them via blob: media sources.
    "media-src 'self' https://*.r2.cloudflarestorage.com blob: https://*.mux.com",
    // Mux: *.mux.com (playback), *.litix.io (Mux Data, their built-in
    // playback-analytics beacon, on by default in Mux Player). Meetings no
    // longer need any Daily.co entries here -- the actual video call happens
    // on Cal.com's own domain (app.cal.com), which visitors are simply
    // navigated to via a normal link, not embedded on this site.
    `connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://challenges.cloudflare.com https://*.r2.cloudflarestorage.com https://api.razorpay.com https://lumberjack.razorpay.com https://www.paypal.com https://connect.facebook.net https://www.facebook.com https://*.mux.com https://*.litix.io`,
    // 'self': the console's own page preview embeds /preview/page/:id in an
    // iframe -- frame-src doesn't fall back to default-src once it's set
    // explicitly, so without this every same-origin iframe (not just
    // third-party embeds) was silently blocked.
    "frame-src 'self' https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com https://checkout.razorpay.com https://api.razorpay.com https://razorpay.com https://www.paypal.com",
    // blob:: hls.js (used internally by Mux Player) runs its media decoding
    // in blob: workers.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ];
}

// Frozen defaults -- fine for designSystem.ts's informational use (telling
// an API/MCP client what hosts a page section can reference) since that's
// advisory text, not an enforced header. On the generic published image
// this reports the brand.ts defaults rather than the real deployment's
// hosts; middleware.ts is the one place that has to be right, and it
// calls buildCspDirectives() with live values instead of these.
const defaultAssetOrigin = `https://${ASSET_DOMAIN}`;
const defaultSiteWww = `https://www.${SITE_HOSTNAME}`;
const cspDirectives = buildCspDirectives(defaultAssetOrigin, defaultSiteWww);
export const CSP_DIRECTIVES = cspDirectives;

// Chromium enforces form-action against a form POST's *redirect target*,
// not just its own action URL (Firefox/Safari only check the latter) --
// confirmed via django-oauth-toolkit's own issue #1623, the exact same
// symptom this site hit: the OAuth consent form POSTs to itself
// (same-origin, fine), but that POST's response is a 302 to the
// connecting client's own redirect_uri (an external origin by design --
// that's the whole point of the redirect), which plain 'self' blocks
// silently in Chrome with no visible error to the end user. The actual
// security check here is server-side (src/app/oauth/authorize/route.ts
// validates redirect_uri against what the client registered, plus PKCE,
// plus the admin session) -- this directive was never what was
// protecting that redirect, so widening it to any https target on just
// this one route doesn't weaken anything real.
export function withOauthAuthorizeFormAction(directives: string[]): string[] {
  return directives.map((d) => (d.startsWith("form-action ") ? "form-action 'self' https:" : d));
}

// Razorpay's checkout.js uses new Function() internally; without
// 'unsafe-eval' checkout can fail to open. Scoped to the pages that mount
// RazorpayCheckoutButton only, so the rest of the site keeps the strict
// policy.
export function withRazorpayUnsafeEval(directives: string[]): string[] {
  return directives.map((d) => (d.startsWith("script-src ") ? d.replace("'unsafe-inline'", "'unsafe-inline' 'unsafe-eval'") : d));
}
