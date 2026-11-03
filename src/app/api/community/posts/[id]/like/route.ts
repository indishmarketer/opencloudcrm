import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isBanned, togglePostLike } from "@/lib/community";
import { checkRateLimit } from "@/lib/rateLimit";
import { createNotification } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isBanned(session.userId)) {
    return NextResponse.json({ error: "You are restricted from liking posts." }, { status: 403 });
  }

  if (!(await checkRateLimit(`community-like:${session.userId}`, 60, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many likes. Try again later." }, { status: 429 });
  }

  const { id } = await params;
  const { like } = await req.json();

  if (typeof like !== "boolean") {
    return NextResponse.json({ error: "Invalid like value" }, { status: 400 });
  }

  const post = await togglePostLike(parseInt(id, 10), session.userId, like);
  if (post) {
    await createNotification(post.userId, "post_liked", {
      actorId: session.userId,
      title: "Someone liked your post",
      body: post.title,
      link: `/community/${post.space}/${id}`,
    });
  }
  return NextResponse.json({ ok: true });
}
