import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { getGoogleReviewUrl, isValidGoogleReviewUrl, setGoogleReviewUrl } from "@/lib/googleReview";

export async function GET() {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ reviewUrl: (await getGoogleReviewUrl()) || "" });
}

export async function PATCH(req: NextRequest) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const reviewUrl = String(body.reviewUrl || "").trim();
  if (!isValidGoogleReviewUrl(reviewUrl)) return NextResponse.json({ error: "Paste the official HTTPS Google review link." }, { status: 400 });
  await setGoogleReviewUrl(reviewUrl);
  return NextResponse.json({ ok: true });
}
