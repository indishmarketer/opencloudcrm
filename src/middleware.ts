import { NextRequest, NextResponse } from "next/server";
import { buildCspDirectives, withRazorpayUnsafeEval, withOauthAuthorizeFormAction } from "@/config/csp";

/** Content-Security-Policy is set here, per-request, instead of in
 * next.config.ts's static headers() -- confirmed live on a real
 * deployment that next.config.ts's config (including headers() and
 * images.remotePatterns) gets serialized into the standalone build at
 * image-build time, not re-read from the environment at container
 * startup the way ordinary server code is. On the project's own
 * published self-host image -- built once generically, with no
 * deployment-specific asset domain -- that froze every self-hoster's CSP
 * to the brand.ts default ("images.example.com") forever, silently
 * blocking every real image in the browser (the server-side request for
 * the image succeeds fine; CSP is enforced client-side, which is why
 * this was invisible to curl and only showed up as broken <img> tags).
 *
 * ASSET_DOMAIN (not NEXT_PUBLIC_ASSET_DOMAIN) is deliberately a plain env
 * var: Next.js inlines every NEXT_PUBLIC_* reference into the compiled
 * bundle at build time, which would freeze this exactly the same way.
 * A plain var is never inlined, so it's read live here on every request,
 * working correctly from just a Coolify env var with no rebuild. */
function assetOrigin(): string {
  return `https://${process.env.ASSET_DOMAIN || "images.example.com"}`;
}

// Matches next.config.ts's old "/courses/:path*" / "/account/courses/:path*"
// patterns, which (path-to-regexp's `*` being optional+repeatable) also
// match the bare prefix itself, not just subpaths.
const RAZORPAY_ROOTS = ["/courses", "/account/courses"];

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const host = req.headers.get("host") || req.nextUrl.hostname;
  const siteWww = `https://www.${host}`;
  let directives = buildCspDirectives(assetOrigin(), siteWww);

  const pathname = req.nextUrl.pathname;
  if (RAZORPAY_ROOTS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    directives = withRazorpayUnsafeEval(directives);
  } else if (pathname === "/oauth/authorize") {
    directives = withOauthAuthorizeFormAction(directives);
  }

  res.headers.set("Content-Security-Policy", directives.join("; "));
  return res;
}

export const config = {
  // Skip static assets and Next's own internals -- the security headers
  // next.config.ts still sets globally (X-Frame-Options etc., none of
  // which are deployment-specific) already cover those; this just adds
  // the deployment-correct CSP on top for everything that renders HTML
  // or serves app data.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
