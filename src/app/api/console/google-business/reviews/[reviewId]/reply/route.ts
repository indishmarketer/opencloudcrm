import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { publishGoogleReviewReply } from "@/lib/googleBusiness";
import { pool } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reviewId } = await params;
  const comment = String((await req.json()).comment || "").trim();
  if (!comment || Buffer.byteLength(comment, "utf8") > 4096) return NextResponse.json({ error: "Reply must be 1-4096 bytes." }, { status: 400 });
  const review = await pool.query("SELECT resource_name FROM google_reviews WHERE review_id=$1", [reviewId]);
  if (!review.rowCount) return NextResponse.json({ error: "Review not found." }, { status: 404 });
  try { await publishGoogleReviewReply(review.rows[0].resource_name, comment); await pool.query(`INSERT INTO google_business_audit_log(admin_email,action,resource_name) VALUES($1,'review_reply_published',$2)`, [adminEmail, review.rows[0].resource_name]); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not publish reply" }, { status: 502 }); }
}
