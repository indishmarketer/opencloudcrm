import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rateLimit";
import { normalizePhoneForWhatsApp, sendWhatsAppMediaMessage, sendWhatsAppTextMessage } from "@/lib/whatsapp";
import { parseConversationKey, replyWindow } from "@/lib/whatsappContacts";
import { replyFromNumberId } from "@/lib/whatsappSender";

import { deleteMediaForMessages } from "@/lib/whatsappMedia";
import { deleteConversationMedia, putConversationMedia, signConversationMedia } from "@/lib/whatsappMediaStore";

const Schema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();

/** What an attachment may be, and how big. Meta accepts more types than
 * this; these are the two worth having in a console reply, and the caps are
 * Meta own limits for them (5MB image, 16MB video). */
const ATTACHMENTS: Record<string, { kind: "image" | "video"; ext: string; maxBytes: number }> = {
  "image/jpeg": { kind: "image", ext: "jpg", maxBytes: 5 * 1024 * 1024 },
  "image/png": { kind: "image", ext: "png", maxBytes: 5 * 1024 * 1024 },
  "video/mp4": { kind: "video", ext: "mp4", maxBytes: 16 * 1024 * 1024 },
};

/** Replies in a conversation, inside Meta's 24-hour customer service
 * window. Free-form text only: outside that window Meta rejects anything
 * but an approved template, so the window is checked here rather than
 * letting the send fail at Meta with a confusing error. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedKey = parseConversationKey((await params).key);
  if (!parsedKey) return NextResponse.json({ error: "Unknown conversation." }, { status: 400 });

  const rateKey = parsedKey.kind === "contact" ? `c${parsedKey.contactId}` : `p${parsedKey.digits}`;
  if (!(await consumeRateLimit(`whatsapp-reply:${rateKey}`, 30, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many replies to this conversation. Try again later." }, { status: 429 });
  }

  let body = "";
  let attachment: File | null = null;
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Could not read the message." }, { status: 400 });
    const parsed = z.object({ body: z.string().trim().max(1024) }).safeParse({ body: form.get("body") || "" });
    if (!parsed.success) return NextResponse.json({ error: "Caption must be 1,024 characters or less." }, { status: 400 });
    body = parsed.data.body;
    const candidate = form.get("image");
    if (candidate instanceof File && candidate.size > 0) attachment = candidate;
  } else {
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Write a message first." }, { status: 400 });
    body = parsed.data.body;
  }
  if (!body.trim() && !attachment) {
    return NextResponse.json({ error: "Write a message or choose a file." }, { status: 400 });
  }

  let to: string | null = null;
  if (parsedKey.kind === "contact") {
    const contact = await pool.query<{ phone: string | null; whatsapp_status: string }>(
      "SELECT phone, whatsapp_status FROM contacts WHERE id = $1",
      [parsedKey.contactId],
    );
    const row = contact.rows[0];
    if (!row) return NextResponse.json({ error: "Unknown contact." }, { status: 404 });
    if (row.whatsapp_status === "unsubscribed") {
      return NextResponse.json({ error: "This contact opted out of WhatsApp." }, { status: 409 });
    }
    // Fall back to the number the conversation itself used: a contact can
    // have the phone column cleared while the thread still exists.
    to =
      row.phone ||
      (
        await pool.query<{ number: string }>(
          `SELECT COALESCE(from_number, to_number) AS number FROM whatsapp_messages
           WHERE contact_id = $1 AND COALESCE(from_number, to_number) IS NOT NULL
           ORDER BY created_at DESC LIMIT 1`,
          [parsedKey.contactId],
        )
      ).rows[0]?.number ||
      null;
  } else {
    to = parsedKey.digits;
  }

  if (!to) return NextResponse.json({ error: "No phone number for this conversation." }, { status: 400 });

  const window = await replyWindow(parsedKey);
  if (!window.open) {
    return NextResponse.json(
      {
        error:
          "The 24-hour reply window has closed. WhatsApp only allows a free-form reply within 24 hours of their last message; send an approved template instead.",
      },
      { status: 409 },
    );
  }

  // Meta ties the 24-hour window to the pair of numbers, so a reply has to
  // leave from the number they messaged even if the console has since
  // switched its default to another one.
  const fromPhoneNumberId = await replyFromNumberId(parsedKey);

  let result;
  if (attachment) {
    const spec = ATTACHMENTS[attachment.type];
    if (!spec) return NextResponse.json({ error: "Attach a JPEG, PNG or MP4 file." }, { status: 400 });
    if (attachment.size > spec.maxBytes) {
      return NextResponse.json(
        { error: `${spec.kind === "video" ? "Video" : "Image"} must be under ${spec.maxBytes / (1024 * 1024)}MB.` },
        { status: 400 },
      );
    }
    // Stored privately, then handed to Meta as a URL signed for an hour.
    // Meta downloads it during this very request and serves its own copy
    // from then on, so the file never needs to be publicly readable and
    // nothing is served from the app server either.
    const stored = await putConversationMedia(
      new Uint8Array(await attachment.arrayBuffer()),
      spec.ext,
      attachment.type,
    );
    if ("error" in stored) return NextResponse.json({ error: stored.error }, { status: 503 });
    const link = await signConversationMedia(stored.key);
    if (!link) {
      // Nothing will ever point at it, and an object nothing points at is
      // exactly what the retention sweep cannot find.
      await deleteConversationMedia(stored.key);
      return NextResponse.json({ error: "Could not prepare that file for sending." }, { status: 503 });
    }
    result = await sendWhatsAppMediaMessage(normalizePhoneForWhatsApp(to), spec.kind, link, body, stored.key, fromPhoneNumberId);
  } else {
    result = await sendWhatsAppTextMessage(normalizePhoneForWhatsApp(to), body, fromPhoneNumberId);
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}

/** Deletes a whole conversation: every message row, and every photo or
 * video belonging to it, gone for good.
 *
 * Deliberately permanent. The point of the button is that a thread we do
 * not need any more should stop costing storage, so a soft delete that
 * leaves the files in R2 would not do the job the owner asked for.
 *
 * Two things it does not do, because it cannot: the copy on the other
 * person's phone is theirs and Meta offers no way to reach it, and Meta's
 * own record of what was billed is unaffected. What does change on our side
 * is Reports, which counts these same rows -- deleting a conversation
 * removes its sends from the delivery and read figures. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedKey = parseConversationKey((await params).key);
  if (!parsedKey) return NextResponse.json({ error: "Unknown conversation." }, { status: 400 });

  // Same predicate the thread itself reads by, so the delete covers exactly
  // what was on screen and nothing else.
  const ids = await pool.query<{ id: string }>(
    parsedKey.kind === "contact"
      ? "SELECT id FROM whatsapp_messages WHERE contact_id = $1"
      : `SELECT id FROM whatsapp_messages
         WHERE contact_id IS NULL AND regexp_replace(COALESCE(from_number, to_number), '\\D', '', 'g') = $1`,
    [parsedKey.kind === "contact" ? parsedKey.contactId : parsedKey.digits],
  );
  const messageIds = ids.rows.map((row) => Number(row.id));
  if (messageIds.length === 0) return NextResponse.json({ error: "That conversation is already empty." }, { status: 404 });

  // Files first: once the rows are gone there is nothing left pointing at
  // the objects, and an orphan in R2 is exactly what this is meant to
  // prevent.
  const files = await deleteMediaForMessages(messageIds);
  await pool.query("DELETE FROM whatsapp_messages WHERE id = ANY($1::bigint[])", [messageIds]);
  // Its unread markers are meaningless once the thread is gone, and would
  // be inherited by a new conversation with the same person.
  await pool
    .query("DELETE FROM whatsapp_conversation_reads WHERE conversation_key = $1", [(await params).key])
    .catch(() => {});

  return NextResponse.json({ ok: true, messages: messageIds.length, files });
}
