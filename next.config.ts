import type { NextConfig } from "next";
import { SITE_HOSTNAME, ASSET_DOMAIN } from "./src/config/brand";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  // Content-Security-Policy is NOT set here -- see src/middleware.ts.
  // next.config.ts's own config (this headers() function included) gets
  // serialized into the standalone build at image-build time rather than
  // re-read from the environment at container startup, so a CSP built
  // from ASSET_DOMAIN/SITE_HOSTNAME here would freeze to brand.ts's
  // defaults on the project's generically-built self-host image, exactly
  // like NEXT_PUBLIC_* does in application code. Middleware runs fresh
  // per request instead.
];

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    // Unlike CSP (moved to middleware.ts for exactly this reason), there's
    // no per-request hook for next/image's own remote-host allowlist --
    // it's internal to Next's image-optimization route and has to be
    // resolved at config-eval/build time. On the generic self-host image
    // this stays frozen to brand.ts's defaults, so an <Image> for a real
    // deployment's own asset host still needs `unoptimized` when that
    // host isn't one of these (see src/components/pageBlocks/BlockImage.tsx
    // for the existing pattern -- it falls back to unoptimized instead of
    // breaking, which happens to paper over this on the generic image too).
    remotePatterns: [
      { protocol: "https", hostname: `www.${SITE_HOSTNAME}` },
      { protocol: "https", hostname: ASSET_DOMAIN },
      { protocol: "https", hostname: SITE_HOSTNAME },
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
  async headers() {
    const privateHeaders = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "Vary", value: "Cookie, Authorization" },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      // The "Featured on" badges. Next serves public/ with max-age=14400,
      // which left Cloudflare revalidating against the VPS on every request
      // (cf-cache-status: REVALIDATED) while real static assets were HITs.
      // These files only change when a directory redraws its badge, and
      // that is a deliberate commit, so let the edge actually keep them.
      {
        source: "/badges/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400" }],
      },
      // Route-specific Content-Security-Policy variants (Razorpay's
      // courses/account-courses pages, OAuth's /authorize) are applied in
      // src/middleware.ts, not here -- see that file and the comment above
      // securityHeaders.
      // No camera/mic override anywhere -- the actual video call happens on
      // Cal.com's own domain (app.cal.com), which visitors are navigated to
      // via a normal link, not embedded here. Camera/mic stay blocked
      // site-wide via the global rule above.
      { source: "/account/:path*", headers: privateHeaders },
      { source: "/console/:path*", headers: privateHeaders },
      { source: "/api/auth/:path*", headers: privateHeaders },
      { source: "/api/account/:path*", headers: privateHeaders },
      { source: "/api/console/:path*", headers: privateHeaders },
      { source: "/api/payments/:path*", headers: privateHeaders },
      { source: "/api/notifications/:path*", headers: privateHeaders },
      { source: "/api/course-comments/:path*", headers: privateHeaders },
    ];
  },
  async redirects() {
    return [
      { source: "/free-tools", destination: "/tools", permanent: true },
      { source: "/contact-us", destination: "/contact", permanent: true },
      { source: "/privacy", destination: "/privacy-policy", permanent: true },
      { source: "/terms-conditions", destination: "/terms", permanent: true },
      { source: "/affiliate-disclaimer", destination: "/terms#affiliate-disclosure", permanent: true },
      { source: "/tag/:slug", destination: "/blog", permanent: true },
      { source: "/resources/prompt-library", destination: "/resources/prompt-skill-library", permanent: true },
      { source: "/resources/prompt-library/browse", destination: "/resources/prompt-skill-library/browse", permanent: true },
      { source: "/resources/prompt-library/browse/:slug", destination: "/resources/prompt-skill-library/browse/prompts/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
