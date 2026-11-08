import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { getSessionSecret, safeRedirectPath } from "@/lib/auth";
import { isSsoProvider, buildAuthorizeUrl } from "@/lib/sso";
import { checkRateLimit } from "@/lib/rateLimit";
import { SITE_URL } from "@/lib/liveSiteUrl";

const secret = () => new TextEncoder().encode(getSessionSecret());

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isSsoProvider(provider)) return NextResponse.json({ error: "Unknown provider." }, { status: 404 });

  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(`oauth-start:${ip}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const ref = searchParams.get("ref")?.trim().slice(0, 100) || null;

  const state = await new SignJWT({ purpose: "sso-state", provider, jti: randomUUID(), redirect, ref })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());

  const redirectUri = `${SITE_URL}/api/auth/oauth/${provider}/callback`;
  return NextResponse.redirect(buildAuthorizeUrl(provider, redirectUri, state));
}
