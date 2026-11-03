import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isModeratorOrAdmin } from "@/lib/community";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  const isModerator = await isModeratorOrAdmin(session.userId);
  return NextResponse.json({ user: { email: session.email, userId: session.userId, isModerator } });
}
