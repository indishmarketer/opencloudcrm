import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sendWebinarQuestionAnswered } from "@/lib/webinarEmails";

/** Lets the console admin actually answer a question -- webinar_comments
 * already supports threaded replies (parent_comment_id) and the attendee
 * room already renders them, this was just the missing write path. Requires
 * the admin's email to match a real users row (webinar_comments.user_id is
 * NOT NULL / FK'd), which every owner/invited admin who has ever used the
 * site's own account features will already have. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const adminEmail = await getAdminSessionEmail();
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, messageId } = await params;
  const webinarId = Number(id);
  const parentId = Number(messageId);
  if (!Number.isInteger(webinarId) || !Number.isInteger(parentId)) return NextResponse.json({ error: "Invalid message." }, { status: 400 });

  const body = await req.json().catch(() => null) as { body?: unknown } | null;
  const replyBody = typeof body?.body === "string" ? body.body.trim().slice(0, 5000) : "";
  if (!replyBody) return NextResponse.json({ error: "Reply can't be empty." }, { status: 400 });

  const adminUser = await pool.query("SELECT id FROM users WHERE lower(email) = $1", [adminEmail.toLowerCase()]);
  if (!adminUser.rows[0]) {
    return NextResponse.json({ error: "Your admin login isn't linked to a site account with this email yet -- create or verify one with the same email to reply." }, { status: 409 });
  }
  const adminUserId = adminUser.rows[0].id;

  const parent = await pool.query(
    `SELECT wc.id, wc.session_start_at, wc.body AS question_body, u.name AS asker_name, u.email AS asker_email, w.title AS webinar_title
     FROM webinar_comments wc
     JOIN users u ON u.id = wc.user_id
     JOIN webinars w ON w.id = wc.webinar_id
     WHERE wc.id = $1 AND wc.webinar_id = $2 AND wc.is_question = true`,
    [parentId, webinarId],
  );
  const parentRow = parent.rows[0];
  if (!parentRow) return NextResponse.json({ error: "Question not found." }, { status: 404 });

  const result = await pool.query(
    `INSERT INTO webinar_comments (webinar_id, user_id, parent_comment_id, body, is_question, status, session_start_at)
     VALUES ($1, $2, $3, $4, false, 'approved', $5)
     RETURNING id, created_at`,
    [webinarId, adminUserId, parentId, replyBody, parentRow.session_start_at],
  );

  sendWebinarQuestionAnswered({
    attendeeEmail: parentRow.asker_email,
    attendeeName: parentRow.asker_name || parentRow.asker_email,
    webinarTitle: parentRow.webinar_title,
    questionBody: parentRow.question_body,
    answerBody: replyBody,
  }).catch((err) => console.error("Webinar question-answered email failed:", err));

  return NextResponse.json({ ok: true, id: result.rows[0].id, created_at: result.rows[0].created_at });
}
