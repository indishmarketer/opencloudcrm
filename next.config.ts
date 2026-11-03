import type { NextConfig } from "next";
import { SITE_HOSTNAME, ASSET_DOMAIN } from "./src/config/brand";
import { OAUTH_AUTHORIZE_CSP, RAZORPAY_CSP, SITE_CSP } from "./src/config/csp";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone=(self), not (): VoiceAgentCall.tsx uses getUserMedia()
  // directly on this origin (the /products/voice-agent demo), not just on
  // the separate voice-agent subdomain (see src/config/csp.ts) --
  // denying it outright would break that feature.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Content-Security-Policy", value: SITE_CSP },
];

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
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
      // Must come after the global rule: for a duplicate header key, the
      // last matching entry wins.
      { source: "/courses/:path*", headers: [{ key: "Content-Security-Policy", value: RAZORPAY_CSP }] },
      { source: "/account/courses/:path*", headers: [{ key: "Content-Security-Policy", value: RAZORPAY_CSP }] },
      { source: "/oauth/authorize", headers: [{ key: "Content-Security-Policy", value: OAUTH_AUTHORIZE_CSP }] },
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
      { source: "/api/voice-agent/:path*", headers: privateHeaders },
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
