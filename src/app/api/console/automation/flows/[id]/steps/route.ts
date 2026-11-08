import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { emailAt } from "@/lib/liveSiteUrl";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { delayDays, fromEmail, subject, bodyHtml, actionType, reviewTemplateKey } = await req.json();
  if (subject === undefined || bodyHtml === undefined) {
    return NextResponse.json({ error: "subject and bodyHtml are required." }, { status: 400 });
  }

  const posResult = await pool.query(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM email_flow_steps WHERE flow_id = $1 AND archived_at IS NULL",
    [Number(id)]
  );
  const nextPos = posResult.rows[0].next_pos;

  const result = await pool.query(
    `INSERT INTO email_flow_steps (flow_id, position, delay_days, from_email, subject, body_html,action_type,review_template_key)
     VALUES ($1, $2, $3, $4, $5, $6,$7,$8) RETURNING id`,
    [
      Number(id),
      nextPos,
      Math.max(0, Number(delayDays) || 0),
      String(fromEmail || emailAt("academy")).slice(0, 200),
      String(subject).slice(0, 300),
      String(bodyHtml),
      actionType === "google_review_request" ? actionType : "email",
      actionType === "google_review_request" ? (reviewTemplateKey === "google-review-reminder" ? reviewTemplateKey : "google-review-request") : null,
    ]
  );
  return NextResponse.json({ id: result.rows[0].id });
}
