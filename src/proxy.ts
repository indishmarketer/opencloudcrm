import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getSessionSecret } from "@/lib/sessionSecret";
import { buildCspDirectives, withRazorpayUnsafeEval, withOauthAuthorizeFormAction } from "@/config/csp";

const SESSION_COOKIE = "im_session";
const ADMIN_COOKIE = "im_admin_session";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const secret = () => new TextEncoder().encode(getSessionSecret());

/** Content-Security-Policy is attached here, per-request, instead of in
 * next.config.ts's static headers() -- confirmed live on a real
 * deployment that next.config.ts's own config (headers(),
 * images.remotePatterns) gets serialized into the standalone build at
 * image-build time, not re-read from the environment at container
 * startup the way this file is. On the project's own published
 * self-host image -- built once generically, with no deployment-specific
 * asset domain -- that froze every self-hoster's CSP img-src to
 * brand.ts's "images.example.com" default forever. The server-side
 * request for the image always succeeds fine (curl never saw a
 * problem); CSP is enforced entirely client-side, so every real image
 * just silently failed to render with no visible error beyond "the
 * image is missing."
 *
 * ASSET_DOMAIN (not NEXT_PUBLIC_ASSET_DOMAIN) is deliberately a plain env
 * var: Next.js inlines every NEXT_PUBLIC_* reference into the compiled
 * bundle at build time, which would freeze this exactly the same way. A
 * plain var is never inlined, so it's read live here on every request,
 * working correctly from just a Coolify env var with no rebuild. The
 * site's own www. entry comes from the request's Host header instead --
 * same technique as src/lib/requestOrigin.ts. */
function assetOrigin(): string {
  return `https://${process.env.ASSET_DOMAIN || "images.example.com"}`;
}

// Matches next.config.ts's old "/courses/:path*" / "/account/courses/:path*"
// patterns, which (path-to-regexp's `*` being optional+repeatable) also
// match the bare prefix itself, not just subpaths.
const RAZORPAY_ROOTS = ["/courses", "/account/courses"];

function withCsp(res: NextResponse, request: NextRequest): NextResponse {
  const host = request.headers.get("host") || request.nextUrl.hostname;
  const siteWww = `https://www.${host}`;
  let directives = buildCspDirectives(assetOrigin(), siteWww);

  const pathname = request.nextUrl.pathname;
  if (RAZORPAY_ROOTS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    directives = withRazorpayUnsafeEval(directives);
  } else if (pathname === "/oauth/authorize") {
    directives = withOauthAuthorizeFormAction(directives);
  }

  res.headers.set("Content-Security-Policy", directives.join("; "));
  return res;
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/") && !SAFE_METHODS.has(request.method)) {
    const usesCookieAuthentication =
      request.cookies.has(SESSION_COOKIE) || request.cookies.has(ADMIN_COOKIE);

    if (usesCookieAuthentication && !isSameOriginRequest(request)) {
      return withCsp(
        NextResponse.json(
          { error: "This request was blocked for your security. Please refresh the page and try again." },
          { status: 403 }
        ),
        request
      );
    }
  }

  if (request.nextUrl.pathname !== "/account" && !request.nextUrl.pathname.startsWith("/account/")) {
    return withCsp(NextResponse.next(), request);
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  let authenticated = false;
  if (token) {
    try {
      await jwtVerify(token, secret());
      authenticated = true;
    } catch {
      authenticated = false;
    }
  }

  if (!authenticated) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return withCsp(NextResponse.redirect(url), request);
  }

  return withCsp(NextResponse.next(), request);
}

function isSameOriginRequest(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");

  // Sec-Fetch-Site explicitly says cross-site — block immediately.
  if (secFetchSite === "cross-site") return false;

  // Sec-Fetch-Site explicitly says same-origin — trust it immediately.
  if (secFetchSite === "same-origin") return true;

  const source = request.headers.get("origin") || request.headers.get("referer");
  if (source) {
    try {
      return new URL(source).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }

  // No Origin, no Referer, no (or unsupported) Sec-Fetch-Site.
  // Modern browsers ALWAYS send an Origin header on cross-origin POST/PUT/
  // PATCH/DELETE, so the only way to reach here is a same-origin request
  // from a browser that omits these headers (older mobile WebViews, some
  // in-app browsers, privacy extensions). Allow it — the attack vector
  // (cross-site form POST) is guaranteed to include Origin by spec.
  return true;
}

export const config = {
  // Widened from the original ["/account/:path*", "/api/:path*"] so every
  // page gets the correct CSP (images, scripts, etc. render site-wide, not
  // just under /account and /api) -- the function's own internal checks
  // already scope the auth-redirect and CSRF logic to just those paths,
  // so this only adds the withCsp() call for everything else.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
