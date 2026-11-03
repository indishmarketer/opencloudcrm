import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getSessionSecret } from "@/lib/sessionSecret";

const SESSION_COOKIE = "im_session";
const ADMIN_COOKIE = "im_admin_session";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const secret = () => new TextEncoder().encode(getSessionSecret());

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/") && !SAFE_METHODS.has(request.method)) {
    const usesCookieAuthentication =
      request.cookies.has(SESSION_COOKIE) || request.cookies.has(ADMIN_COOKIE);

    if (usesCookieAuthentication && !isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: "This request was blocked for your security. Please refresh the page and try again." },
        { status: 403 }
      );
    }
  }

  if (request.nextUrl.pathname !== "/account" && !request.nextUrl.pathname.startsWith("/account/")) {
    return NextResponse.next();
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
    return NextResponse.redirect(url);
  }
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
  matcher: ["/account/:path*", "/api/:path*"],
};
