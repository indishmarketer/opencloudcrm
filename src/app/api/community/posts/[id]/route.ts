import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isModeratorOrAdmin } from "@/lib/community";
import { extractR2ImageUrls } from "@/lib/extractImageUrls";
import { deleteFromR2 } from "@/lib/r2Upload";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId)) return NextResponse.json({ error: "Invalid post." }, { status: 400 });

  const result = await pool.query("SELECT user_id, body FROM forum_posts WHERE id = $1", [postId]);
  const post = result.rows[0];
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const canDelete = post.user_id === session.userId || (await isModeratorOrAdmin(session.userId));
  if (!canDelete) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  await pool.query("DELETE FROM forum_posts WHERE id = $1", [postId]);

  const images = extractR2ImageUrls(post.body);
  await Promise.all(images.map((url) => deleteFromR2(url)));

  return NextResponse.json({ ok: true });
}
