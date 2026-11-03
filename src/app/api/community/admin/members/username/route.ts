import { NextRequest, NextResponse } from "next/server";
import { getCommunityModerator } from "@/lib/communityAdminAuth";
import { adminSetUsername } from "@/lib/community";

export async function PATCH(req: NextRequest) {
  if (!(await getCommunityModerator())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { username, newUsername } = await req.json();
  if (!username || typeof username !== "string" || !newUsername || typeof newUsername !== "string") {
    return NextResponse.json({ error: "Username and new username are required." }, { status: 400 });
  }

  const result = await adminSetUsername(username.trim(), newUsername.trim().toLowerCase());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
