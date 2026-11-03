import { NextRequest, NextResponse } from "next/server";
import { getCommunityOwner } from "@/lib/communityAdminAuth";
import { updateSpaceSettings, type Space } from "@/lib/community";

export async function PATCH(req: NextRequest) {
  if (!(await getCommunityOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { space, auto_approve_posts, auto_approve_comments } = await req.json();
  if (space !== "general" && space !== "pro") {
    return NextResponse.json({ error: "Invalid space." }, { status: 400 });
  }

  await updateSpaceSettings(space as Space, {
    auto_approve_posts: typeof auto_approve_posts === "boolean" ? auto_approve_posts : undefined,
    auto_approve_comments: typeof auto_approve_comments === "boolean" ? auto_approve_comments : undefined,
  });
  return NextResponse.json({ ok: true });
}
