import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rateLimit";
import { normalizePhoneForWhatsApp, sendWhatsAppTemplateMessage } from "@/lib/whatsapp";
import { buildSendComponents, getTemplateMedia, listWhatsAppTemplates, MEDIA_PARAM_TYPE } from "@/lib/whatsappTemplates";
import { generatePhoneCode } from "@/lib/accountContact";

const Schema = z.object({
  to: z.string().trim().min(6).max(20),
  templateName: z.string().trim().min(1).max(512),
  language: z.string().trim().min(2).max(10),
  variables: z.array(z.string().max(500)).max(20),
  /** Required when the template has a media header: every send of one
   * supplies its own media, the template only stores a review sample. */
  headerMedia: z.object({
    type: z.enum(["image", "video", "document"]),
    link: z.string().trim().url().max(2000),
  }).optional(),
  /** The value appended to a dynamic link button URL, with its position in
   * the template buttons array. */
  urlButton: z.object({
    index: z.number().int().min(0).max(9),
    value: z.string().trim().min(1).max(500),
  }).optional(),
}).strict();

/** Sends a real template message to a number the admin types in, so a
 * template can be checked on a phone without faking a booking or a purchase
 * to trigger one. Every send is logged to whatsapp_messages like any other. */
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await consumeRateLimit("whatsapp-test-send", 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many test sends. Try again later." }, { status: 429 });
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid test message details." }, { status: 400 });

  const to = normalizePhoneForWhatsApp(parsed.data.to);
  if (to.length < 8) return NextResponse.json({ error: "Enter the full number including country code." }, { status: 400 });

  // Falls back to the file saved with the template, so a media template can
  // be tested (and sent automatically) without pasting a URL every time.
  const stored = await getTemplateMedia(parsed.data.templateName).catch(() => null);
  const media = parsed.data.headerMedia
    ?? (stored ? { type: MEDIA_PARAM_TYPE[stored.format], link: stored.media_url } : undefined);
  const templates = await listWhatsAppTemplates().catch(() => []);
  const template = templates.find((item) => item.name === parsed.data.templateName && item.language === parsed.data.language);
  const isAuthentication = template?.category === "AUTHENTICATION";
  const testCode = isAuthentication ? generatePhoneCode() : null;
  const components = isAuthentication
    ? [
        { type: "body", parameters: [{ type: "text", text: testCode }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: testCode }] },
      ]
    : buildSendComponents({
        variables: parsed.data.variables,
        media,
        urlButton: parsed.data.urlButton ?? null,
      });

  const result = await sendWhatsAppTemplateMessage(
    to,
    parsed.data.templateName,
    parsed.data.language,
    components,
    {
      previewBody: isAuthentication
        ? `Test verification code: ${testCode}`
        : template?.components.find((component) => component.type === "BODY")?.text
          ?.replace(/\{\{(\d+)\}\}/g, (_, n: string) => parsed.data.variables[Number(n) - 1] || "") || null,
      // Whatever file went out, not only an image, so the thread shows a
      // video or document header instead of an empty bubble.
      mediaUrl: media?.link ?? null,
    },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, waMessageId: result.waMessageId });
}
