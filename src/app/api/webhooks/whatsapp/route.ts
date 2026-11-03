import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { storeInboundWhatsAppMedia, verifyWhatsAppSignature } from "@/lib/whatsapp";
import { raiseAlert, raiseInboxAlert } from "@/lib/systemAlerts";
import {
  findContactByPhone,
  isOptInMessage,
  isOptOutButtonReply,
  isOptOutMessage,
  setWhatsAppStatus,
} from "@/lib/whatsappContacts";

/** One-time handshake Meta performs when you save the Callback URL in the
 * app dashboard (and whenever it re-verifies). Must echo back
 * hub.challenge, and only when hub.verify_token matches what we configured
 * on our side -- that token is what proves to Meta this endpoint is ours. */
export async function GET(req: NextRequest) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed." }, { status: 403 });
}

type WhatsAppValue = {
  messages?: Array<{
    id?: string;
    from?: string;
    type?: string;
    text?: { body?: string };
    [key: string]: unknown;
  }>;
  statuses?: Array<{
    id?: string;
    status?: string;
    recipient_id?: string;
    /** What Meta charged for this message, by its own classification. */
    pricing?: { billable?: boolean; category?: string; pricing_model?: string };
    [key: string]: unknown;
  }>;
  /** Meta's identity for the sender. `wa_id` is their phone number today,
   * but usernames and Business Scoped User IDs are rolling out, after
   * which it stops being one. */
  contacts?: Array<{ wa_id?: string; user_id?: string; profile?: { name?: string } }>;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
};

/** A quick-reply button tap, if that is what this message is. The title is
 * one of our own button labels, which is how an opt-out button works. */
function buttonReplyTitle(message: NonNullable<WhatsAppValue["messages"]>[number]): string | null {
  const interactive = message.interactive as { button_reply?: { title?: string } } | undefined;
  // A template quick reply arrives as `button`, not `interactive`; an
  // interactive-message button arrives as the latter. Both are taps.
  const button = message.button as { text?: string } | undefined;
  return interactive?.button_reply?.title || button?.text || null;
}

/** Reads as a plain description of what arrived rather than a type name:
 * "image" told the owner nothing a thumbnail would not. */
const MEDIA_DESCRIPTION: Record<string, string> = {
  image: "Photo",
  video: "Video",
  audio: "Voice message",
  document: "Document",
  sticker: "Sticker",
  location: "Location",
  contacts: "Shared a contact",
};

/** Pulls the message/status text out of whatever shape the message type
 * uses -- text, media caption, button reply, etc. Falls back to a
 * description of the type so nothing in the inbox is ever blank. */
function extractBody(message: NonNullable<WhatsAppValue["messages"]>[number]): string {
  if (message.text?.body) return message.text.body;
  const interactive = message.interactive as { list_reply?: { title?: string } } | undefined;
  const button = buttonReplyTitle(message);
  if (button) return button;
  if (interactive?.list_reply?.title) return interactive.list_reply.title;
  // A photo or video usually carries its own caption, which is the real
  // message; the type name is only the fallback when it does not.
  for (const key of ["image", "video", "document"] as const) {
    const caption = (message as unknown as Record<string, { caption?: string } | undefined>)[key]?.caption;
    if (caption?.trim()) return caption.trim();
  }
  return MEDIA_DESCRIPTION[message.type || ""] || `[${message.type || "unknown"} message]`;
}

/** The media id on an inbound message, whichever media type it is. */
function inboundMediaId(message: NonNullable<WhatsAppValue["messages"]>[number]): string | null {
  for (const key of ["image", "video", "audio", "document", "sticker"] as const) {
    const part = (message as unknown as Record<string, { id?: string } | undefined>)[key];
    if (part?.id) return part.id;
  }
  return null;
}

async function storeInboundMedia(message: NonNullable<WhatsAppValue["messages"]>[number]): Promise<string | null> {
  const id = inboundMediaId(message);
  return id ? await storeInboundWhatsAppMedia(id).catch(() => null) : null;
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > 1024 * 1024) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody) > 1024 * 1024) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyWhatsAppSignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // A 200 tells Meta the event is safely ours and it never sends it again,
  // so answering 200 after a failed write silently loses a customer reply.
  // We answer 500 instead and let Meta retry: migration 117's unique key
  // makes replaying the same payload a no-op, so retrying is free.
  try {
    await recordEvents(payload);
  } catch (err) {
    await raiseAlert({
      kind: "whatsapp_webhook_error",
      dedupeKey: `whatsapp_webhook_error:${new Date().toISOString().slice(0, 13)}`,
      title: "WhatsApp webhook failed to process an event",
      detail: `${err instanceof Error ? err.message : String(err)}. Returned 500 so Meta retries; if this keeps failing Meta will eventually disable the subscription.`,
      severity: "critical",
    });
    return NextResponse.json({ error: "Could not record event." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Delivery reports arrive out of order often enough to matter: a late
// "sent" must not undo a "read" that already landed. Higher wins; "failed"
// is terminal and always wins.
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

async function recordEvents(payload: unknown): Promise<void> {
  const entries = (payload as { entry?: Array<{ changes?: Array<{ value?: WhatsAppValue }> }> })?.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;
      const toNumber = value.metadata?.display_phone_number || null;
      // Which of our numbers this arrived at. Meta's 24-hour reply window
      // belongs to the pair of numbers, so a reply has to go back out from
      // this one rather than from whichever is the current default.
      const businessNumberId = value.metadata?.phone_number_id || null;

      // Meta's own id for the sender, which is not necessarily their phone
      // number any more (usernames and BSUIDs). Recorded next to the
      // number so conversations are not permanently keyed on one.
      const waUserId = value.contacts?.[0]?.user_id || value.contacts?.[0]?.wa_id || null;

      for (const message of value.messages || []) {
        const body = extractBody(message);
        const contactId = message.from ? await findContactByPhone(message.from) : null;

        // ON CONFLICT, not a plain insert: this same payload is replayed
        // whenever we fail and Meta retries.
        const inserted = await pool.query<{ id: string }>(
          `INSERT INTO whatsapp_messages (direction, wa_message_id, from_number, to_number, message_type, body, raw, contact_id, wa_user_id, business_phone_number_id)
           VALUES ('inbound', $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
           ON CONFLICT (wa_message_id, direction) WHERE wa_message_id IS NOT NULL DO NOTHING
           RETURNING id`,
          [message.id || null, message.from || null, toNumber, message.type || null, body, JSON.stringify(message), contactId, waUserId, businessNumberId],
        );

        // Meta sends a media id, not the file, and the URL it resolves to
        // expires -- so a photo somebody sent has to be copied to R2 now or
        // not at all. Deliberately *after* the insert and only for a row
        // that was actually new: a retried payload would otherwise upload
        // the same file again and leave the first copy in R2 with nothing
        // pointing at it. Best effort either way -- a failure here leaves
        // the message with its caption and no picture, which beats
        // refusing the payload and being retried.
        const newRowId = inserted.rows[0]?.id;
        if (newRowId) {
          const mediaKey = await storeInboundMedia(message);
          if (mediaKey) {
            await pool
              .query("UPDATE whatsapp_messages SET media_key = $2 WHERE id = $1", [newRowId, mediaKey])
              .catch((err) => console.error("Failed to attach inbound WhatsApp media:", err));
          }
        }

        // One notification per person per day, not per message: a back and
        // forth conversation would otherwise bury everything else in the
        // list. The date is in the dedupe key, so tomorrow they notify
        // again. Only fires for a genuinely new row, so a retried Meta
        // payload cannot raise it twice.
        if (newRowId && message.from) {
          const today = new Date().toISOString().slice(0, 10);
          // The thread page only accepts a conversation key shaped "c-<contact
          // id>" or "p-<digits>" (see parseConversationKey in whatsappContacts.ts)
          // -- a bare phone number 404s, which is what this used to send.
          const conversationKey = contactId ? `c-${contactId}` : `p-${message.from}`;
          raiseInboxAlert({
            kind: "whatsapp_inbound",
            dedupeKey: `whatsapp_inbound:${message.from}:${today}`,
            title: `New WhatsApp message from ${message.from}`,
            detail: body ? body.slice(0, 200) : "No text in the message.",
            link: `/console/whatsapp/messages/${encodeURIComponent(conversationKey)}`,
            // Console-only: an inbound message is routine, not urgent, and
            // at any real volume emailing one per sender per day would run
            // up real SES cost for something the Needs Attention badge
            // already surfaces just fine.
            notifyEmail: false,
          }).catch(() => {});
        }

        // A tapped button counts as an opt-out when its label says so --
        // the label is ours, so it reads "Unsubscribe from updates" rather
        // than the bare "STOP" a typed message would.
        const optOut = isOptOutMessage(body) || isOptOutButtonReply(buttonReplyTitle(message));

        // "STOP" has to take effect even for someone we cannot match to a
        // contact -- but without a contact there is nothing to record it
        // against, so alert instead of dropping it silently.
        if (contactId && optOut) {
          await setWhatsAppStatus(contactId, "unsubscribed", buttonReplyTitle(message) ? "reply_button" : "reply_stop");
        } else if (contactId && isOptInMessage(body)) {
          await setWhatsAppStatus(contactId, "subscribed", "reply_stop");
        } else if (!contactId && optOut) {
          await raiseAlert({
            kind: "whatsapp_optout_unmatched",
            dedupeKey: `whatsapp_optout_unmatched:${message.from || "unknown"}`,
            title: `WhatsApp opt-out from a number with no contact: ${message.from || "unknown"}`,
            detail: "Someone sent STOP but their number does not match any contact, so the opt-out could not be recorded. Find them and set it by hand before sending anything else.",
            severity: "critical",
            link: "/console/whatsapp/messages",
          });
        }
      }

      for (const status of value.statuses || []) {
        // A status update belongs to a message we already logged as
        // outbound when we sent it -- update that row's status rather than
        // inserting a duplicate, and only ever move it forwards.
        const rank = STATUS_RANK[status.status || ""] ?? 0;
        // Pricing only appears on some reports (usually the first for a
        // conversation), so COALESCE keeps whatever was already recorded
        // instead of blanking it on the next report.
        const updated = await pool.query(
          `UPDATE whatsapp_messages SET status = $1,
             raw = $4::jsonb || jsonb_build_object('request', raw->'request'),
             pricing_category = COALESCE($5, pricing_category),
             billable = COALESCE($6, billable)
           WHERE wa_message_id = $2 AND direction = 'outbound'
             AND COALESCE(CASE status
               WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 4
               ELSE 0 END, 0) < $3`,
          [
            status.status || null,
            status.id || null,
            rank,
            JSON.stringify(status),
            status.pricing?.category || null,
            typeof status.pricing?.billable === "boolean" ? status.pricing.billable : null,
          ],
        );
        if (updated.rowCount === 0) {
          // Either the row is already at this status (a retry, or a later
          // report that arrived first) or we never logged the send.
          await pool.query(
            `INSERT INTO whatsapp_messages (direction, wa_message_id, to_number, status, raw, pricing_category, billable)
             VALUES ('outbound', $1, $2, $3, $4::jsonb, $5, $6)
             ON CONFLICT (wa_message_id, direction) WHERE wa_message_id IS NOT NULL DO NOTHING`,
            [
              status.id || null,
              status.recipient_id || null,
              status.status || null,
              JSON.stringify(status),
              status.pricing?.category || null,
              typeof status.pricing?.billable === "boolean" ? status.pricing.billable : null,
            ],
          );
        }

        // A campaign recipient's row tracks only our own send attempt, so
        // a message Meta later reports as failed would otherwise still read
        // as sent in the campaign report.
        if (status.status === "failed" && status.id) {
          await pool.query(
            `UPDATE whatsapp_campaign_sends SET status = 'failed',
               last_error = COALESCE(last_error, 'Meta reported the message as failed after it was accepted.')
             WHERE wa_message_id = $1 AND status = 'sent'`,
            [status.id],
          );
        }
      }
    }
  }
}
