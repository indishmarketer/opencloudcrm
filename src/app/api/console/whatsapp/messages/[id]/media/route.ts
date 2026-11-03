import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { deleteMessageMedia } from "@/lib/whatsappMedia";
import { readConversationMedia } from "@/lib/whatsappMediaStore";

/** Serves one message's photo or video to the console.
 *
 * The file sits in a bucket with no public access, so this is the only way
 * to see it, and it checks the admin session on every request. That is the
 * point: whatever a customer sends us can be an ID document or a bank
 * screenshot, and it should not be sitting on a public URL that keeps
 * working forever for anyone who ever saw it.
 *
 * Cached privately and briefly so scrolling a thread does not re-fetch
 * every picture, but no shared cache is allowed to keep a copy. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Unknown message." }, { status: 400 });

  const row = (
    await pool.query<{ media_key: string | null }>("SELECT media_key FROM whatsapp_messages WHERE id = $1", [id])
  ).rows[0];
  if (!row?.media_key) return NextResponse.json({ error: "No file on that message." }, { status: 404 });

  const file = await readConversationMedia(row.media_key);
  if (!file) return NextResponse.json({ error: "That file is no longer in storage." }, { status: 404 });

  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": "inline",
      // It is someone else's file being rendered inside our console; there
      // is no reason for it to be able to do anything but be displayed.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Deletes one message's photo or video from storage, permanently.
 *
 * The message stays and the conversation still reads correctly; only the
 * file goes. Everything that passes through a conversation is stored by us
 * (Meta fetches outbound media from a URL, and an inbound file is only
 * downloadable from Meta for a short while), so without this the bucket
 * only ever grows. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Unknown message." }, { status: 400 });

  const result = await deleteMessageMedia(id);
  // 409 rather than 502/503 anywhere a refusal carries a reason: Cloudflare
  // replaces 5xx bodies with its own error page and the reason never
  // reaches the browser.
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
