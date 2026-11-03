import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rateLimit";
import { normalizePhoneForWhatsApp, sendWhatsAppTemplateMessage } from "@/lib/whatsapp";
import {
  buildSendComponents,
  dynamicUrlButtonIndex,
  getTemplateMedia,
  listWhatsAppTemplates,
  MEDIA_PARAM_TYPE,
  templateBody,
  templateButtons,
  templateHeaderMedia,
  templateVariables,
} from "@/lib/whatsappTemplates";
import { getWhatsAppVariableMappings, resolveWhatsAppVariableMappings } from "@/lib/whatsappVariableMappings";

const Schema = z.object({
  templateName: z.string().trim().min(1).max(512),
}).strict();

/** Sends one approved template to one contact, from their contact record.
 *
 * This is the gap the external review called the biggest functional one:
 * the only way to send was "Send test" with a phone number typed by hand,
 * which meant the owner had to copy a number out of the CRM to message
 * someone in it. Here the number, the name and the consent state all come
 * from the contact row.
 *
 * The template is read back from Meta rather than trusted from the
 * request: a template that is not approved cannot be sent, and the count
 * of variables has to match the body or Meta rejects the send with an
 * unhelpful error. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isInteger(contactId)) return NextResponse.json({ error: "Invalid contact." }, { status: 400 });

  if (!(await consumeRateLimit(`whatsapp-contact-send:${contactId}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many WhatsApp messages to this contact. Try again later." }, { status: 429 });
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a template first." }, { status: 400 });

  const contactResult = await pool.query<{
    name: string | null;
    email: string;
    phone: string | null;
    whatsapp_status: string;
  }>("SELECT name, email, phone, whatsapp_status FROM contacts WHERE id = $1", [contactId]);
  const contact = contactResult.rows[0];
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  if (!contact.phone) return NextResponse.json({ error: "This contact has no phone number." }, { status: 409 });
  if (contact.whatsapp_status === "unsubscribed") {
    return NextResponse.json({ error: "This contact opted out of WhatsApp." }, { status: 409 });
  }

  let template;
  try {
    const templates = await listWhatsAppTemplates();
    template = templates.find((t) => t.name === parsed.data.templateName);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not reach WhatsApp." },
      { status: 409 },
    );
  }
  if (!template) return NextResponse.json({ error: "That template no longer exists." }, { status: 404 });
  if (template.status !== "APPROVED") {
    return NextResponse.json({ error: `That template is ${template.status.toLowerCase()}, so it cannot be sent.` }, { status: 409 });
  }
  if (template.category === "AUTHENTICATION") {
    return NextResponse.json({ error: "One-time-code templates are sent automatically for account verification, not by hand." }, { status: 409 });
  }

  // Marketing is the one category that needs an explicit yes; a utility
  // template is a service message about something they did.
  if (template.category === "MARKETING" && contact.whatsapp_status !== "subscribed") {
    return NextResponse.json(
      { error: "This is a marketing template and this contact has not opted in to WhatsApp." },
      { status: 409 },
    );
  }

  const needed = templateVariables(templateBody(template)).length;
  const mappings = await getWhatsAppVariableMappings(template.name);
  if (mappings.length !== needed) return NextResponse.json({ error: "Set up every variable in WhatsApp → Templates before sending." }, { status: 409 });
  let variables: string[];
  try { variables = await resolveWhatsAppVariableMappings(template.name, contactId); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not fill this template from contact activity." }, { status: 409 }); }

  const mediaFormat = templateHeaderMedia(template);
  let media: { type: "image" | "video" | "document"; link: string } | null = null;
  if (mediaFormat) {
    const stored = await getTemplateMedia(template.name).catch(() => null);
    const link = stored?.media_url;
    if (!link) {
      return NextResponse.json(
        { error: "This template has a media header and no file is saved for it. Add one on the Templates tab." },
        { status: 409 },
      );
    }
    media = { type: MEDIA_PARAM_TYPE[mediaFormat], link };
  }

  const buttonIndex = dynamicUrlButtonIndex(template);
  const urlButton = buttonIndex !== null ? templateButtons(template).find((button, index) => index === buttonIndex) : null;
  const exampleUrl = urlButton?.type === "URL" ? urlButton.example?.[0] : null;
  const buttonBase = urlButton?.type === "URL" ? urlButton.url.replace(/\{\{1\}\}$/, "") : "";
  const buttonValue = buttonIndex !== null && exampleUrl?.startsWith(buttonBase) ? exampleUrl.slice(buttonBase.length) : null;
  if (buttonIndex !== null && !buttonValue) return NextResponse.json({ error: "This template's link button needs a value configured in the Templates tab." }, { status: 409 });

  const result = await sendWhatsAppTemplateMessage(
    normalizePhoneForWhatsApp(contact.phone),
    template.name,
    template.language,
    buildSendComponents({
      variables,
      media,
      urlButton: buttonIndex !== null && buttonValue ? { index: buttonIndex, value: buttonValue } : null,
    }),
    {
      previewBody: templateBody(template).replace(/\{\{(\d+)\}\}/g, (_, n: string) => variables[Number(n) - 1] || ""),
      // Whatever file went out, not only an image: the thread renders a
      // video or a document from this and showed nothing for them before.
      mediaUrl: media?.link ?? null,
    },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, waMessageId: result.waMessageId });
}
