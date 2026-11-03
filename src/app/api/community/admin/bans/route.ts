import { NextRequest, NextResponse } from "next/server";
import { getCommunityModerator } from "@/lib/communityAdminAuth";
import { listBans, banUserByUsername, unbanUser } from "@/lib/community";

export async function GET() {
  if (!(await getCommunityModerator())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ bans: await listBans() });
}

export async function POST(req: NextRequest) {
  const actor = await getCommunityModerator();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { username, reason } = await req.json();
  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  const result = await banUserByUsername(username.trim(), actor.userId, reason ? String(reason).slice(0, 300) : null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await getCommunityModerator())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await req.json();
  const targetId = Number(userId);
  if (!Number.isInteger(targetId)) return NextResponse.json({ error: "Invalid member." }, { status: 400 });

  await unbanUser(targetId);
  return NextResponse.json({ ok: true });
}
