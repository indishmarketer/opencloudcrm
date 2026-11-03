import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listNotifications, getUnreadNotificationCount, markNotificationsRead } from "@/lib/notifications";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [notifications, unreadCount] = await Promise.all([
    listNotifications(session.userId),
    getUnreadNotificationCount(session.userId),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await markNotificationsRead(session.userId);
  return NextResponse.json({ ok: true });
}
