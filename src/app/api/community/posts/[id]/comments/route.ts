import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { isBanned, getUserProAccess } from "@/lib/community";
import { createNotification } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isBanned(session.userId)) {
    return NextResponse.json({ error: "You've been restricted from posting in the community." }, { status: 403 });
  }

  if (!(await checkRateLimit(`community-comment:${session.userId}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many comments. Try again later." }, { status: 429 });
  }

  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId)) return NextResponse.json({ error: "Invalid post." }, { status: 400 });

  const { body, parentCommentId } = await req.json();
  if (!body || typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "Comment can't be empty." }, { status: 400 });
  }

  const postResult = await pool.query("SELECT space, title, user_id FROM forum_posts WHERE id = $1", [postId]);
  const post = postResult.rows[0];
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  if (post.space === "pro" && !(await getUserProAccess(session.userId))) {
    return NextResponse.json({ error: "PRO access required to comment here." }, { status: 403 });
  }

  const settingsResult = await pool.query(
    "SELECT auto_approve_comments FROM community_settings WHERE space = $1",
    [post.space]
  );
  const autoApprove = settingsResult.rows[0]?.auto_approve_comments ?? true;

  let parentId: number | null = null;
  let parentUserId: number | null = null;
  if (parentCommentId !== undefined && parentCommentId !== null) {
    parentId = Number(parentCommentId);
    if (!Number.isInteger(parentId)) {
      return NextResponse.json({ error: "Invalid parent comment." }, { status: 400 });
    }
    const parent = await pool.query(
      "SELECT user_id FROM forum_comments WHERE id = $1 AND post_id = $2",
      [parentId, postId],
    );
    if (parent.rowCount !== 1) {
      return NextResponse.json({ error: "Parent comment is not part of this post." }, { status: 400 });
    }
    parentUserId = parent.rows[0].user_id;
  }

  const result = await pool.query(
    `INSERT INTO forum_comments (post_id, user_id, parent_comment_id, body, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      postId,
      session.userId,
      parentId,
      String(body).slice(0, 5000),
      autoApprove ? "approved" : "pending",
    ]
  );

  if (autoApprove) {
    await pool.query("UPDATE users SET community_points = community_points + 1 WHERE id = $1", [
      session.userId,
    ]);
  }

  if (autoApprove) {
    const link = `/community/${post.space}/${postId}`;
    if (parentId) {
      if (parentUserId) {
        await createNotification(parentUserId, "comment_replied", {
          actorId: session.userId,
          title: "Someone replied to your comment",
          body: post.title,
          link,
        });
      }
    } else {
      await createNotification(post.user_id, "post_commented", {
        actorId: session.userId,
        title: "Someone commented on your post",
        body: post.title,
        link,
      });
    }
  }

  return NextResponse.json({ ok: true, id: result.rows[0].id, status: autoApprove ? "approved" : "pending" });
}
