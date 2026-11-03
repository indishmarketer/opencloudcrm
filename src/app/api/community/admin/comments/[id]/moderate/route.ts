import { NextRequest, NextResponse } from "next/server";
import { getCommunityModerator } from "@/lib/communityAdminAuth";
import { moderateComment } from "@/lib/community";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCommunityModerator())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const commentId = Number(id);
  if (!Number.isInteger(commentId)) return NextResponse.json({ error: "Invalid comment." }, { status: 400 });

  const { action } = await req.json();
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  await moderateComment(commentId, action === "approve");
  return NextResponse.json({ ok: true });
}
