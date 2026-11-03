import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { pool } from "@/lib/db";
import { parseConversationKey } from "@/lib/whatsappContacts";

/** Marks a conversation as read, which is what clears its unread count in
 * the inbox.
 *
 * A POST from the open thread rather than a write while rendering it: the
 * conversation list links to these pages, and a link can be prefetched
 * before anyone clicks it, which would quietly clear the badge on a
 * conversation nobody had actually read.
 *
 * Per admin, not per console: with invited admins, one person opening a
 * chat used to clear its badge for everyone. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const admin = await getAdminSessionEmail();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await params;
  if (!parseConversationKey(key)) return NextResponse.json({ error: "Unknown conversation." }, { status: 400 });

  await pool.query(
    `INSERT INTO whatsapp_conversation_reads (conversation_key, admin_email, last_read_at) VALUES ($1, $2, now())
     ON CONFLICT (conversation_key, admin_email) DO UPDATE SET last_read_at = now()`,
    [key, admin],
  );
  return NextResponse.json({ ok: true });
}
