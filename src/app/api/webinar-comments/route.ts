import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { isBanned } from "@/lib/community";
import { listWebinarComments, canCommentOnWebinar } from "@/lib/webinars";
import { sendWebinarQuestionOwnerAlert } from "@/lib/webinarEmails";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
  const webinarId = Number(req.nextUrl.searchParams.get("webinarId"));
  if (!Number.isInteger(webinarId)) return NextResponse.json({ error: "Missing webinar." }, { status: 400 });
  if (!(await canCommentOnWebinar(session.userId, webinarId))) {
    return NextResponse.json({ error: "You don't have access to comment on this webinar." }, { status: 403 });
  }
  const isModerator = await isModeratorForWebinar(session.userId);
  const occurrence = await pool.query("SELECT session_start_at FROM webinar_access WHERE webinar_id = $1 AND user_id = $2", [webinarId, session.userId]);
  const occurrenceSessionStartAt = occurrence.rows[0]?.session_start_at || null;
  // Questions, plus any host replies to them (a reply is never a top-level
  // question -- it always carries a parent_comment_id) -- without the
  // second half of this condition, a host's answer was silently dropped
  // from every attendee's feed even though it was saved.
  const comments = (await listWebinarComments(webinarId, { viewerUserId: session.userId, viewerIsModerator: isModerator, occurrenceSessionStartAt })).filter((comment) => comment.is_question || comment.parent_comment_id !== null);
  return NextResponse.json({ comments }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isBanned(session.userId)) {
    return NextResponse.json({ error: "You've been restricted from posting." }, { status: 403 });
  }

  if (!(await checkRateLimit(`webinar-comment:${session.userId}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many comments. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const webinarId = Number(body?.webinarId);
  const rawBody = typeof body?.body === "string" ? String(body.body).trim() : "";
  const parentCommentIdRaw = body?.parentCommentId;

  if (!Number.isInteger(webinarId)) return NextResponse.json({ error: "Invalid webinar." }, { status: 400 });
  if (!rawBody) return NextResponse.json({ error: "Comment can't be empty." }, { status: 400 });
  if (rawBody.length > 5000) return NextResponse.json({ error: "Comment is too long." }, { status: 400 });

  if (!(await canCommentOnWebinar(session.userId, webinarId))) {
    return NextResponse.json({ error: "You don't have access to comment on this webinar." }, { status: 403 });
  }

  let parentId: number | null = null;
  if (parentCommentIdRaw !== undefined && parentCommentIdRaw !== null) {
    parentId = Number(parentCommentIdRaw);
    if (!Number.isInteger(parentId)) return NextResponse.json({ error: "Invalid parent comment." }, { status: 400 });
    const parent = await pool.query("SELECT 1 FROM webinar_comments WHERE id = $1 AND webinar_id = $2", [parentId, webinarId]);
    if ((parent.rowCount ?? 0) !== 1) return NextResponse.json({ error: "Parent comment is not part of this webinar." }, { status: 400 });
  }

  // escapeHtml per AGENTS.md for comment bodies stored? We store raw and escape on render, but also ensure no HTML stored as-is is treated.
  // We store the raw trimmed string but callers must escapeHtml on display. We still store sanitized length.
  // Insert with parameterized query (no interpolation).
  const sanitizedBody = rawBody.slice(0, 5000);

  const occurrence = await pool.query("SELECT session_start_at FROM webinar_access WHERE webinar_id = $1 AND user_id = $2", [webinarId, session.userId]);
  const sessionStartAt = occurrence.rows[0]?.session_start_at;
  if (!sessionStartAt) return NextResponse.json({ error: "Reserve the next webinar broadcast before asking a question." }, { status: 409 });

  // Questions are held in the attendee's own broadcast occurrence. There is no
  // attendee-to-attendee chat in a simulated-live, on-demand webinar.
  // For now insert as 'approved' to match course_comments migration default.
  const isModerator = await isModeratorForWebinar(session.userId);
  const status = isModerator ? "approved" : "approved";

  const result = await pool.query(
    `INSERT INTO webinar_comments (webinar_id, user_id, parent_comment_id, body, is_question, status, session_start_at)
     VALUES ($1,$2,$3,$4,true,$5,$6) RETURNING id`,
    [webinarId, session.userId, parentId, sanitizedBody, status, sessionStartAt],
  );

  await pool.query("UPDATE users SET community_points = community_points + 1 WHERE id = $1", [session.userId]);

  const asker = await pool.query("SELECT name, email FROM users WHERE id = $1", [session.userId]);
  const webinarRow = await pool.query("SELECT title FROM webinars WHERE id = $1", [webinarId]);
  if (asker.rows[0] && webinarRow.rows[0]) {
    sendWebinarQuestionOwnerAlert({
      webinarId,
      webinarTitle: webinarRow.rows[0].title,
      attendeeName: asker.rows[0].name || asker.rows[0].email,
      attendeeEmail: asker.rows[0].email,
      questionBody: sanitizedBody,
    }).catch((err) => console.error("Webinar question owner alert failed:", err));
  }

  return NextResponse.json({ ok: true, id: result.rows[0].id });
}

async function isModeratorForWebinar(userId: number): Promise<boolean> {
  // Reuse community moderators / console owner
  const { isModeratorOrAdmin } = await import("@/lib/community");
  return isModeratorOrAdmin(userId);
}
