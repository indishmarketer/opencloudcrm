import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyNewsletterTrackingToken } from "@/lib/newsletterTracking";
import { SITE_URL } from "@/lib/liveSiteUrl";

export async function GET(req: NextRequest) {
  const tracking = await verifyNewsletterTrackingToken(
    req.nextUrl.searchParams.get("t"),
    "newsletter-click",
  );
  if (!tracking?.target) {
    return NextResponse.redirect(SITE_URL);
  }
  const target = new URL(tracking.target);
  if (!['http:', 'https:'].includes(target.protocol)) {
    return NextResponse.redirect(SITE_URL);
  }

  await pool.query(
      `UPDATE newsletter_sends
       SET clicked_at = COALESCE(clicked_at, now()), click_count = click_count + 1,
           opened_at = COALESCE(opened_at, now())
       WHERE id = $1`,
      [tracking.sendId]
    );

  return NextResponse.redirect(target);
}
