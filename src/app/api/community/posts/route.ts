import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { isBanned, getUserProAccess } from "@/lib/community";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { raiseInboxAlert } from "@/lib/systemAlerts";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isBanned(session.userId)) {
    return NextResponse.json({ error: "You've been restricted from posting in the community." }, { status: 403 });
  }

  if (!(await checkRateLimit(`community-post:${session.userId}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many posts. Try again later." }, { status: 429 });
  }

  const { space, categoryId, title, body } = await req.json();
  if (space !== "general" && space !== "pro") {
    return NextResponse.json({ error: "Invalid space." }, { status: 400 });
  }
  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (!body || typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "Post body is required." }, { status: 400 });
  }

  if (space === "pro" && !(await getUserProAccess(session.userId))) {
    return NextResponse.json({ error: "PRO access required to post here." }, { status: 403 });
  }

  const settingsResult = await pool.query(
    "SELECT auto_approve_posts FROM community_settings WHERE space = $1",
    [space]
  );
  const autoApprove = settingsResult.rows[0]?.auto_approve_posts ?? true;

  const result = await pool.query(
    `INSERT INTO forum_posts (space, category_id, user_id, title, body, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      space,
      categoryId || null,
      session.userId,
      String(title).slice(0, 200),
      String(body).slice(0, 10000),
      autoApprove ? "approved" : "pending",
    ]
  );

  if (autoApprove) {
    await pool.query("UPDATE users SET community_points = community_points + 3 WHERE id = $1", [
      session.userId,
    ]);
  }

  // Outbound webhook payloads intentionally preserve raw text. Receivers must
  // escape or sanitize fields before rendering them as HTML.
  emitWebhookEvent({
    eventType: "community.post_created",
    source: "forum_posts",
    sourceRecordId: result.rows[0].id,
    contactEmail: session.email,
    userId: session.userId,
    data: { post_id: result.rows[0].id, space, title: String(title).slice(0, 200), status: autoApprove ? "approved" : "pending" },
  }).catch(() => {});

  // Only the ones held for moderation. An approved post is already public
  // and needs nothing from the owner, so notifying on those would make the
  // list noise within a week.
  if (!autoApprove) {
    raiseInboxAlert({
      kind: "community_post_pending",
      dedupeKey: `community_post_pending:${result.rows[0].id}`,
      title: "A community post is waiting for approval",
      detail: String(title).slice(0, 160),
      link: "/console/community",
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, id: result.rows[0].id, status: autoApprove ? "approved" : "pending" });
}
