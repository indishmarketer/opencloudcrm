import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyNewsletterTrackingToken } from "@/lib/newsletterTracking";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64"
);

export async function GET(req: NextRequest) {
  const tracking = await verifyNewsletterTrackingToken(
    req.nextUrl.searchParams.get("t"),
    "newsletter-open",
  );
  if (tracking) {
    await pool.query(
      `UPDATE newsletter_sends
       SET opened_at = COALESCE(opened_at, now()), open_count = open_count + 1
       WHERE id = $1`,
      [tracking.sendId]
    );
  }
  return new NextResponse(new Uint8Array(PIXEL), {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store",
    },
  });
}
