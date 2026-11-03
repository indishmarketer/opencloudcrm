import { NextRequest, NextResponse } from "next/server";
import { getCommunityOwner } from "@/lib/communityAdminAuth";
import { listModerators, setModerator } from "@/lib/community";

export async function GET() {
  if (!(await getCommunityOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ moderators: await listModerators() });
}

export async function POST(req: NextRequest) {
  if (!(await getCommunityOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { username } = await req.json();
  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  const result = await setModerator(username.trim(), true);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await getCommunityOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { username } = await req.json();
  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  const result = await setModerator(username.trim(), false);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
