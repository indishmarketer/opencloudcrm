import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/auth";
import { pool } from "@/lib/db";
import { z } from "zod";
import { getSegmentById } from "@/lib/contactSegments";
import { dynamicUrlButtonIndex, getTemplateMedia, listWhatsAppTemplates, templateBody, templateButtons, templateHeaderMedia, templateVariables } from "@/lib/whatsappTemplates";
import { getWhatsAppVariableMappings } from "@/lib/whatsappVariableMappings";

const DraftSchema = z.object({
  name: z.string().trim().min(1).max(200),
  templateName: z.string().trim().min(1).max(512),
  segmentId: z.number().int().positive(),
  variables: z.array(z.string().max(500)).max(20),
  mediaUrl: z.string().trim().url().max(2000).optional(),
  buttonUrlParam: z.string().trim().max(500).optional(),
}).strict();

/** Deleting a local campaign removes its recipient/report snapshot. Messages
 * already delivered remain in WhatsApp and the inbox. A live send cannot be
 * removed while the dispatcher is still processing it. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSessionEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId)) return NextResponse.json({ error: "Invalid campaign." }, { status: 400 });

  const deleted = await pool.query("DELETE FROM whatsapp_campaigns WHERE id = $1 AND status <> 'sending' RETURNING id", [campaignId]);
  if (!deleted.rowCount) {
    const current = await pool.query<{ status: string }>("SELECT status FROM whatsapp_campaigns WHERE id = $1", [campaignId]);
    return current.rowCount
      ? NextResponse.json({ error: "A campaign cannot be deleted while it is sending." }, { status: 409 })
      : NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/** Edits only a draft and revalidates all template/audience data at save time. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const email = await getAdminSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const campaignId = Number((await params).id);
  if (!Number.isInteger(campaignId)) return NextResponse.json({ error: "Invalid campaign." }, { status: 400 });
  const parsed = DraftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Fill in the campaign details." }, { status: 400 });

  const segment = await getSegmentById(parsed.data.segmentId);
  if (!segment) return NextResponse.json({ error: "That audience no longer exists." }, { status: 404 });
  let templates;
  try { templates = await listWhatsAppTemplates(); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reach WhatsApp." }, { status: 409 }); }
  const template = templates.find((item) => item.name === parsed.data.templateName);
  if (!template) return NextResponse.json({ error: "That template no longer exists." }, { status: 404 });
  if (template.status !== "APPROVED") return NextResponse.json({ error: "Only an approved template can be used in a campaign." }, { status: 409 });
  if (template.category === "AUTHENTICATION") return NextResponse.json({ error: "One-time-code templates cannot be sent to a list." }, { status: 409 });
  const needed = templateVariables(templateBody(template)).length;
  const mappings = await getWhatsAppVariableMappings(template.name);
  if (mappings.length !== needed) return NextResponse.json({ error: "Set up every variable in WhatsApp → Templates before using this campaign." }, { status: 409 });

  const mediaFormat = templateHeaderMedia(template);
  let mediaUrl: string | null = null;
  if (mediaFormat) {
    const stored = await getTemplateMedia(template.name).catch(() => null);
    mediaUrl = stored?.media_url || null;
    if (!mediaUrl) return NextResponse.json({ error: "This template has a media header. Save a file for it on the Templates tab first." }, { status: 409 });
  }
  const buttonIndex = dynamicUrlButtonIndex(template);
  const urlButton = buttonIndex !== null ? templateButtons(template).find((button, index) => index === buttonIndex) : null;
  const exampleUrl = urlButton?.type === "URL" ? urlButton.example?.[0] : null;
  const buttonBase = urlButton?.type === "URL" ? urlButton.url.replace(/\{\{1\}\}$/, "") : "";
  const buttonUrlParam = parsed.data.buttonUrlParam || (exampleUrl?.startsWith(buttonBase) ? exampleUrl.slice(buttonBase.length) : null);
  if (buttonIndex !== null && !buttonUrlParam) return NextResponse.json({ error: "Set the link button value in the template before using this campaign." }, { status: 409 });

  const updated = await pool.query(
    `UPDATE whatsapp_campaigns
     SET name = $2, template_name = $3, language = $4, category = $5, variables = $6::jsonb,
         header_media_url = $7, header_media_format = $8, button_url_param = $9, button_url_index = $10,
         segment_id = $11
     WHERE id = $1 AND status = 'draft' RETURNING id`,
    [campaignId, parsed.data.name, template.name, template.language, template.category, JSON.stringify(parsed.data.variables), mediaUrl, mediaFormat, buttonIndex !== null ? buttonUrlParam : null, buttonIndex, parsed.data.segmentId],
  );
  if (!updated.rowCount) return NextResponse.json({ error: "Only a draft campaign can be edited." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
