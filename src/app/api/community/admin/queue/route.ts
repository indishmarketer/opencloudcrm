import { NextResponse } from "next/server";
import { getCommunityModerator } from "@/lib/communityAdminAuth";
import { listPendingPosts, listPendingComments } from "@/lib/community";

export async function GET() {
  if (!(await getCommunityModerator())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [posts, comments] = await Promise.all([listPendingPosts(), listPendingComments()]);
  return NextResponse.json({ posts, comments });
}
