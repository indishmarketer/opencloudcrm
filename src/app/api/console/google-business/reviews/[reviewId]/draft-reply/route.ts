import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reviewId } = await params;
  const result = await pool.query("SELECT reviewer_name,star_rating,comment FROM google_reviews WHERE review_id=$1 AND expires_at>now()", [reviewId]);
  if (!result.rowCount) return NextResponse.json({ error: "Review not found." }, { status: 404 });
  const apiKey = process.env.POLLINATIONS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "POLLINATIONS_API_KEY is not configured." }, { status: 503 });
  const review = result.rows[0];
  const response = await fetch("https://gen.pollinations.ai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: "openai", messages: [{ role: "system", content: "Draft a warm, concise business reply to a Google review. Be truthful, do not invent facts, do not disclose private information, do not argue, and do not offer incentives. Return only the reply text. A human administrator will edit and approve it before publication." }, { role: "user", content: JSON.stringify({ reviewer: review.reviewer_name, rating: review.star_rating, review: review.comment }) }], stream: false }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: "Pollinations could not draft a reply." }, { status: 502 });
  const draft = String(body?.choices?.[0]?.message?.content || "").trim().slice(0, 4096);
  if (!draft) return NextResponse.json({ error: "Pollinations returned an empty draft." }, { status: 502 });
  return NextResponse.json({ draft });
}
