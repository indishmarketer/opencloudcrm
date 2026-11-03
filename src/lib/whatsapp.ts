import crypto from "crypto";
import { pool } from "@/lib/db";

/** One place for the Graph API version every WhatsApp call uses, including
 * the WABA-scoped ones in whatsappTemplates.ts.
 *
 * Meta retires versions on a fixed schedule and v21.0 -- the version this
 * integration was built on -- is removed on 21 January 2027, after which
 * every call here would start failing. Overridable by env so a version that
 * misbehaves can be rolled back without a code deploy. */
export function graphVersion(): string {
  return process.env.META_GRAPH_VERSION?.trim() || "v26.0";
}

/** Strips everything but digits -- Meta's Cloud API wants the `to` field as
 * country code + number only, no "+", spaces or dashes. */
export function normalizePhoneForWhatsApp(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Verifies the `X-Hub-Signature-256` header Meta sends on every webhook
 * POST, proving the request came from Meta and not a forged caller hitting
 * our public endpoint directly. */
export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const given = signatureHeader.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

type SendResult = { ok: true; waMessageId: string } | { ok: false; error: string };

/** A readable one-liner for the message log. A template send is a name plus
 * its filled-in values rather than the finished text (Meta renders that from
 * the approved template, we never hold it), so the log shows what went out
 * instead of a blank row. */
function outboundSummary(body: Record<string, unknown>, preview?: string | null): string | null {
  if (preview) return preview;
  if (body.type === "text") {
    const text = body.text as { body?: string } | undefined;
    return text?.body ?? null;
  }
  // Every media type, not just image: a video send used to log nothing at
  // all, so the inbox listed it as "No text" and its caption was lost.
  for (const kind of ["image", "video", "audio", "document", "sticker"] as const) {
    if (body.type !== kind) continue;
    const part = body[kind] as { caption?: string } | undefined;
    return part?.caption?.trim() || MEDIA_SUMMARY[kind];
  }
  return null;
}

const MEDIA_SUMMARY: Record<string, string> = {
  image: "Photo",
  video: "Video",
  audio: "Voice message",
  document: "Document",
  sticker: "Sticker",
};

/** Recorded alongside the send so reports can group by it. Without these
 * two, a row only holds the rendered summary text, which cannot be counted
 * per template or per campaign. */
export type SendContext = {
  /** Which of our numbers to send from. Defaults to whichever the console
   * has selected; a reply passes the number its thread arrived on. */
  fromPhoneNumberId?: string | null;
  templateName?: string | null;
  campaignId?: number | null;
  previewBody?: string | null;
  /** A public file Meta was pointed at: a template's own sample. */
  mediaUrl?: string | null;
  /** An object in the private conversation bucket. Recorded instead of a
   * URL because the signed one Meta was handed expires within the hour. */
  mediaKey?: string | null;
  /** Expected pricing category: "marketing" | "utility" | "authentication" | "service". */
  pricingCategory?: string | null;
};

/** A template's Meta category, cached: every send looks this up to decide
 * which of our numbers it goes out from, and Meta re-categorises templates
 * on its own, so it is read from Meta rather than stored by us. */
const templateCategoryCache = new Map<string, { category: string; expiresAt: number }>();
async function resolveTemplateCategory(name: string): Promise<string | null> {
  const hit = templateCategoryCache.get(name);
  if (hit && hit.expiresAt > Date.now()) return hit.category;
  try {
    const { listWhatsAppTemplates } = await import("@/lib/whatsappTemplates");
    const template = (await listWhatsAppTemplates()).find((item) => item.name === name);
    if (!template?.category) return null;
    templateCategoryCache.set(name, { category: template.category, expiresAt: Date.now() + 5 * 60 * 1000 });
    return template.category;
  } catch {
    // Routing is a preference; a send must not fail because the category
    // could not be read. The default number handles it.
    return null;
  }
}

const templatePreviewCache = new Map<string, { body: string; expiresAt: number }>();
async function resolveTemplatePreview(name: string, language: string, sentComponents: unknown[]): Promise<string | null> {
  const key = `${name}:${language}`;
  const cached = templatePreviewCache.get(key);
  let body = cached && cached.expiresAt > Date.now() ? cached.body : "";
  if (!body) {
    try {
      const { listWhatsAppTemplates, templateBody } = await import("@/lib/whatsappTemplates");
      const template = (await listWhatsAppTemplates()).find((item) => item.name === name && item.language === language);
      body = template ? templateBody(template) : "";
      if (body) templatePreviewCache.set(key, { body, expiresAt: Date.now() + 5 * 60 * 1000 });
    } catch { return null; }
  }
  const parameters = ((sentComponents.find((component) => (component as { type?: string }).type === "body") as { parameters?: { text?: string }[] } | undefined)?.parameters || []);
  return body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => parameters[Number(n) - 1]?.text || "");
}

async function callGraphApi(
  path: string,
  body: Record<string, unknown>,
  toNumber: string,
  context: SendContext = {},
): Promise<SendResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const { activeSendingNumberId } = await import("@/lib/whatsappSender");
  const phoneNumberId = context.fromPhoneNumberId || (await activeSendingNumberId());
  if (!accessToken || !phoneNumberId) return { ok: false, error: "WhatsApp is not configured." };

  let result: SendResult;
  try {
    const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${phoneNumberId}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !data) {
      const message = data && typeof data === "object" ? JSON.stringify((data as { error?: unknown }).error ?? data) : `HTTP ${res.status}`;
      result = { ok: false, error: message.slice(0, 500) };
    } else {
      const messages = (data.messages as Array<{ id?: string }> | undefined) || [];
      const waMessageId = messages[0]?.id;
      result = waMessageId ? { ok: true, waMessageId } : { ok: false, error: "No message id in response." };
    }
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : "Request failed." };
  }

  // Best-effort logging so sends show up next to inbound messages/status
  // updates in whatsapp_messages -- never lets a logging failure affect the
  // result the caller gets back.
  // Imported lazily: whatsappContacts imports this module for phone
  // normalisation, and a static import both ways is a cycle.
  const contactId = await import("@/lib/whatsappContacts")
    .then((m) => m.findContactByPhone(toNumber))
    .catch(() => null);

  const templateName =
    context.templateName ?? (body.type === "template" ? (body.template as { name?: string })?.name ?? null : null);
  const template = body.template as { name?: string; language?: { code?: string }; components?: unknown[] } | undefined;
  const previewBody = context.previewBody ?? (template?.name
    ? await resolveTemplatePreview(template.name, template.language?.code || "", template.components || [])
    : null);
  const templateImageUrl = template?.components?.flatMap((component) => {
    const item = component as { type?: string; parameters?: { type?: string; image?: { link?: string } }[] };
    return item.type === "header" ? (item.parameters || []).map((p) => p.type === "image" ? p.image?.link : null) : [];
  }).find((value): value is string => typeof value === "string") || null;

  await pool
    .query(
      `INSERT INTO whatsapp_messages (direction, wa_message_id, to_number, message_type, body, status, raw, contact_id, template_name, campaign_id, media_url, media_key, business_phone_number_id, pricing_category, billable)
       VALUES ('outbound', $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (wa_message_id, direction) WHERE wa_message_id IS NOT NULL
       DO UPDATE SET
         to_number = EXCLUDED.to_number,
         message_type = EXCLUDED.message_type,
         body = EXCLUDED.body,
         contact_id = EXCLUDED.contact_id,
         template_name = EXCLUDED.template_name,
         campaign_id = EXCLUDED.campaign_id,
         media_url = EXCLUDED.media_url,
         media_key = EXCLUDED.media_key,
         business_phone_number_id = EXCLUDED.business_phone_number_id,
         pricing_category = COALESCE(whatsapp_messages.pricing_category, EXCLUDED.pricing_category),
         billable = COALESCE(whatsapp_messages.billable, EXCLUDED.billable)`,
      [
        result.ok ? result.waMessageId : null,
        toNumber,
        String(body.type || "unknown"),
        outboundSummary(body, previewBody),
        result.ok ? "sent" : "failed",
        JSON.stringify({ request: body, ok: result.ok, error: result.ok ? undefined : result.error }),
        contactId,
        templateName,
        context.campaignId ?? null,
        context.mediaUrl ?? (body.type === "image" ? (body.image as { link?: string } | undefined)?.link ?? null : templateImageUrl),
        context.mediaKey ?? null,
        phoneNumberId,
        context.pricingCategory || null,
        context.pricingCategory === "service" ? false : (context.pricingCategory ? true : null),
      ],
    )
    .catch((err) => console.error("Failed to log outbound WhatsApp message:", err));

  return result;
}

/** Sends an approved message template. This is the only way to message a
 * customer outside the 24-hour window that opens after they message you
 * first (e.g. a purchase confirmation sent the moment an order comes in).
 * `to` is E.164 without a leading "+" (e.g. "919876543210").
 * `components` follows Meta's template-components shape, for templates
 * with variables -- omit it for a template with no placeholders. */
export async function sendWhatsAppTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  components?: unknown[],
  context: SendContext = {},
): Promise<SendResult> {
  // Which number this goes out from follows the template's category
  // unless the caller named one: marketing is what gets blocked and
  // reported, so it can be kept off the number that carries order
  // confirmations and one-time codes.
  let fromPhoneNumberId = context.fromPhoneNumberId;
  const category = await resolveTemplateCategory(templateName);
  if (!fromPhoneNumberId) {
    const { numberForTemplateCategory } = await import("@/lib/whatsappSender");
    fromPhoneNumberId = await numberForTemplateCategory(category);
  }

  return callGraphApi(
    "messages",
    {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    },
    to,
    {
      ...context,
      templateName,
      fromPhoneNumberId,
      pricingCategory: context.pricingCategory || category?.toLowerCase() || "utility",
    },
  );
}

/** Sends a free-form text message. Only deliverable inside the 24-hour
 * window after the customer's last message -- outside that window Meta
 * rejects it and sendWhatsAppTemplateMessage must be used instead. */
export async function sendWhatsAppTextMessage(
  to: string,
  text: string,
  fromPhoneNumberId?: string | null,
): Promise<SendResult> {
  return callGraphApi(
    "messages",
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    to,
    { fromPhoneNumberId, pricingCategory: "service" },
  );
}

/** Sends an image or video by public URL. Callers upload to R2 first; Meta
 * fetches the file from that URL and delivers it as WhatsApp media rather
 * than as a link, so the recipient sees the photo or video in the chat and
 * nothing is served from our own origin. The URL has to stay reachable
 * until Meta has fetched it. */
export async function sendWhatsAppMediaMessage(
  to: string,
  kind: "image" | "video",
  url: string,
  caption?: string,
  mediaKey?: string,
  fromPhoneNumberId?: string | null,
): Promise<SendResult> {
  return callGraphApi("messages", {
    messaging_product: "whatsapp", to, type: kind,
    [kind]: { link: url, ...(caption?.trim() ? { caption: caption.trim() } : {}) },
  }, to, mediaKey
    // The URL handed to Meta is signed and stops working within the hour,
    // so it is the key that gets recorded, never the link.
    ? { mediaKey, mediaUrl: null, fromPhoneNumberId, pricingCategory: "service" }
    : { mediaUrl: url, fromPhoneNumberId, pricingCategory: "service" });
}

export async function sendWhatsAppImageMessage(to: string, imageUrl: string, caption?: string): Promise<SendResult> {
  return sendWhatsAppMediaMessage(to, "image", imageUrl, caption);
}

/** What an inbound file is saved as. Anything not listed is skipped rather
 * than stored under a guessed extension, which would break the URL-based
 * type check the console uses to decide how to render it. */
const INBOUND_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
};

const MAX_INBOUND_MEDIA_BYTES = 16 * 1024 * 1024;

/** Copies a file somebody sent us into the private conversation bucket and
 * returns its key.
 *
 * Meta does not put the file in the webhook: it sends a media id, and the
 * download URL that id resolves to is short-lived and needs the access
 * token, so it cannot be shown in the console or stored for later. Without
 * this, an inbound photo arrived as the text "[image message]" and the
 * picture itself was simply lost once Meta expired it.
 *
 * Private, not public: this is whatever a customer chose to send us, which
 * can be an ID document or a bank screenshot, and the images bucket is
 * readable by anyone holding the URL.
 *
 * Returns null rather than throwing on anything unexpected -- the webhook
 * must still answer Meta, and a missing picture is a far smaller problem
 * than a retry storm. */
export async function storeInboundWhatsAppMedia(mediaId: string): Promise<string | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken || !mediaId) return null;
  try {
    const lookup = await fetch(`https://graph.facebook.com/${graphVersion()}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!lookup.ok) return null;
    const meta = (await lookup.json()) as { url?: string; mime_type?: string; file_size?: number };
    const mime = (meta.mime_type || "").split(";")[0].trim();
    const ext = INBOUND_EXTENSIONS[mime];
    if (!meta.url || !ext) return null;
    if (meta.file_size && meta.file_size > MAX_INBOUND_MEDIA_BYTES) return null;

    const download = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!download.ok) return null;
    const bytes = await download.arrayBuffer();
    if (bytes.byteLength > MAX_INBOUND_MEDIA_BYTES) return null;

    const { putConversationMedia } = await import("@/lib/whatsappMediaStore");
    const stored = await putConversationMedia(new Uint8Array(bytes), ext, mime);
    return "error" in stored ? null : stored.key;
  } catch {
    return null;
  }
}
