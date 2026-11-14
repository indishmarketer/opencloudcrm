import { NextRequest, NextResponse } from "next/server";
import { verifyEmailVerificationToken, safeRedirectPath, isSameOriginPost } from "@/lib/auth";
import { completeAccountVerification } from "@/lib/accountVerification";
import { SITE_URL } from "@/lib/liveSiteUrl";

/** Compatibility path for verification links issued before account OTPs. */
export async function GET(req: NextRequest) {
  const params = new URLSearchParams();
  params.set("token", req.nextUrl.searchParams.get("token") || "");
  params.set("redirect", safeRedirectPath(req.nextUrl.searchParams.get("redirect")));
  return NextResponse.redirect(new URL(`/verify-email?${params}`, SITE_URL));
}

export async function POST(req: NextRequest) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") || "");
  const redirect = safeRedirectPath(String(form?.get("redirect") || ""));
  const verified = token ? await verifyEmailVerificationToken(token) : null;
  if (!verified) return NextResponse.redirect(new URL("/login?error=verification_expired", SITE_URL), 303);
  const destination = await completeAccountVerification(req, verified.userId, verified.email, redirect);
  return NextResponse.redirect(new URL(destination, SITE_URL), 303);
}
