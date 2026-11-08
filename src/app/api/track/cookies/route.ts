import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GA4_COOKIE_NAMES } from "@/lib/ga4Server";
import { SITE_URL } from "@/lib/liveSiteUrl";

/** Re-issues the GA4 and Meta cookies from our own server. Safari (ITP)
 * caps cookies that scripts write to 7 days (1 day after an ad click), but
 * not cookies our own origin sets in a response, so returning visitors keep
 * the same client id and ad clicks stay attributed. Also creates _fbp and,
 * after a Meta ad click, _fbc when the pixel is blocked, so the Conversions
 * API events still match the click. Called once per visit by Analytics. */
const MAX_AGE = 60 * 60 * 24 * 400; // the longest any browser allows
const ROOT_DOMAIN = new URL(SITE_URL).hostname.replace(/^www\./, "");
const VALUE_PATTERN = /^[A-Za-z0-9._$\-]{1,300}$/;
const FBCLID_PATTERN = /^[A-Za-z0-9_\-]{1,500}$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const res = NextResponse.json({ ok: true });
  const host = (req.headers.get("host") || req.nextUrl.hostname).split(":")[0];
  // GA4 and the pixel write these on the registrable domain; matching it
  // updates their cookie instead of adding a second copy.
  const domain = host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`) ? ROOT_DOMAIN : undefined;
  const secure = req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
  // Raw header, not res.cookies.set: that URL-encodes the "$" in GA4's
  // session cookie, and GA4 would then start a new session.
  const set = (name: string, value: string) =>
    res.headers.append(
      "Set-Cookie",
      `${name}=${value}; Max-Age=${MAX_AGE}; Path=/${domain ? `; Domain=${domain}` : ""}; SameSite=Lax${secure ? "; Secure" : ""}`,
    );

  for (const name of GA4_COOKIE_NAMES) {
    const value = req.cookies.get(name)?.value;
    if (value && VALUE_PATTERN.test(value)) set(name, value);
  }

  const fbp = req.cookies.get("_fbp")?.value;
  if (fbp && VALUE_PATTERN.test(fbp)) set("_fbp", fbp);
  else set("_fbp", `fb.1.${Date.now()}.${crypto.randomInt(1_000_000_000, 2_147_483_647)}`);

  const fbc = req.cookies.get("_fbc")?.value;
  const fbclid = typeof body?.fbclid === "string" && FBCLID_PATTERN.test(body.fbclid) ? body.fbclid : null;
  if (fbclid && !fbc?.endsWith(`.${fbclid}`)) set("_fbc", `fb.1.${Date.now()}.${fbclid}`);
  else if (fbc && VALUE_PATTERN.test(fbc)) set("_fbc", fbc);

  return res;
}
