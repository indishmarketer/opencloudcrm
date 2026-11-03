import * as Sentry from "@sentry/nextjs";

// Routed through /api/monitoring instead of straight to Sentry's ingest
// domain: keeps the site's CSP connect-src closed to third-party hosts and
// avoids ad-blockers that filter direct requests to *.sentry.io.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.05,
  tunnel: "/api/monitoring",
});
