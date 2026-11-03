import { NextRequest, NextResponse } from "next/server";
import { getCommunityModerator } from "@/lib/communityAdminAuth";
import { moderatePost } from "@/lib/community";
import { createNotification } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCommunityModerator())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId)) return NextResponse.json({ error: "Invalid post." }, { status: 400 });

  const { action } = await req.json();
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const post = await moderatePost(postId, action === "approve");
  if (post && action === "approve") {
    await createNotification(post.userId, "post_approved", {
      title: "Your post was approved",
      body: post.title,
      link: `/community/${post.space}/${postId}`,
    });
  }
  return NextResponse.json({ ok: true });
}
