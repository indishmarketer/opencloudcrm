import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendMessage } from "@/lib/messages";
import { pool } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { isBanned } from "@/lib/community";
import { createNotification } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isBanned(session.userId)) {
    return NextResponse.json({ error: "You've been restricted from sending messages." }, { status: 403 });
  }

  if (!(await checkRateLimit(`community-messages:${session.userId}`, 30, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many messages. Try again later." }, { status: 429 });
  }

  const { receiverId, body } = await req.json();

  if (!receiverId || typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Ensure receiver exists and is not banned
  const userCheck = await pool.query("SELECT id FROM users WHERE id = $1 AND id NOT IN (SELECT user_id FROM community_bans)", [receiverId]);
  if (userCheck.rowCount === 0) {
    return NextResponse.json({ error: "User not found or is unavailable" }, { status: 404 });
  }

  await sendMessage(session.userId, receiverId, body.trim());
  await createNotification(receiverId, "new_message", {
    actorId: session.userId,
    title: "You have a new message",
    body: body.trim().slice(0, 140),
    link: `/community/messages`,
  });
  return NextResponse.json({ ok: true });
}
