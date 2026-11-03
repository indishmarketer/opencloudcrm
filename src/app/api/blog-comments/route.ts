import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { listBlogComments, isBanned } from "@/lib/community";
import { getPublicPosts } from "@/lib/blogPosts";

export async function GET(req: NextRequest) {
  const postSlug = req.nextUrl.searchParams.get("slug");
  if (!postSlug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });
  const comments = await listBlogComments(postSlug, {});
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isBanned(session.userId)) {
    return NextResponse.json({ error: "You've been restricted from posting in the community." }, { status: 403 });
  }

  if (!(await checkRateLimit(`blog-comment:${session.userId}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many comments. Try again later." }, { status: 429 });
  }

  const { postSlug, body, parentCommentId } = await req.json();
  if (!postSlug || typeof postSlug !== "string") {
    return NextResponse.json({ error: "Invalid post." }, { status: 400 });
  }
  if (!body || typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "Comment can't be empty." }, { status: 400 });
  }
  if (!(await getPublicPosts()).some((post) => post.slug === postSlug)) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  let parentId: number | null = null;
  if (parentCommentId !== undefined && parentCommentId !== null) {
    parentId = Number(parentCommentId);
    if (!Number.isInteger(parentId)) {
      return NextResponse.json({ error: "Invalid parent comment." }, { status: 400 });
    }
    const parent = await pool.query(
      "SELECT 1 FROM blog_comments WHERE id = $1 AND post_slug = $2",
      [parentId, postSlug],
    );
    if (parent.rowCount !== 1) {
      return NextResponse.json({ error: "Parent comment is not part of this post." }, { status: 400 });
    }
  }

  const result = await pool.query(
    `INSERT INTO blog_comments (post_slug, user_id, parent_comment_id, body)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [postSlug, session.userId, parentId, String(body).slice(0, 5000)]
  );

  await pool.query("UPDATE users SET community_points = community_points + 1 WHERE id = $1", [session.userId]);

  return NextResponse.json({ ok: true, id: result.rows[0].id });
}
