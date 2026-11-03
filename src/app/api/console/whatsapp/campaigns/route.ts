import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSessionEmail } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getSegmentById } from "@/lib/contactSegments";
import { countCampaignAudience } from "@/lib/whatsappCampaigns";
import {
  dynamicUrlButtonIndex,
  getTemplateMedia,
  listWhatsAppTemplates,
  templateBody,
  templateHeaderMedia,
  templateVariables,
  templateButtons,
} from "@/lib/whatsappTemplates";
import { getWhatsAppVariableMappings } from "@/lib/whatsappVariableMappings";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  templateName: z.string().trim().min(1).max(512),
  segmentId: z.number().int().positive(),
  variables: z.array(z.string().max(500)).max(20),
  mediaUrl: z.string().trim().url().max(2000).optional(),
  buttonUrlParam: z.string().trim().max(500).optional(),
}).strict();

/** The audience size for a segment, filtered the way a campaign will
 * actually filter it. Shown before sending so the number on screen is the
 * number of messages that go out, not the segment's raw size. */
export async function GET(req: NextRequest) {
  if (!(await getAdminSessionEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const segmentId = Number(req.nextUrl.searchParams.get("segmentId") || 0);
  if (!Number.isInteger(segmentId) || segmentId <= 0) {
    return NextResponse.json({ error: "Pick an audience." }, { status: 400 });
  }
  const segment = await getSegmentById(segmentId);
  if (!segment) return NextResponse.json({ error: "That audience no longer exists." }, { status: 404 });
  return NextResponse.json({ count: await countCampaignAudience(segment.rules) });
}

/** Creates a draft campaign. Nothing is sent here: the draft is checked
 * against Meta first (the template has to exist, be approved, and have the
 * right number of values) so an impossible campaign cannot be saved and
 * then fail halfway through a list. */
export async function POST(req: NextRequest) {
  const email = await getAdminSessionEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Fill in the campaign details." }, { status: 400 });

  const segment = await getSegmentById(parsed.data.segmentId);
  if (!segment) return NextResponse.json({ error: "That audience no longer exists." }, { status: 404 });

  let templates;
  try {
    templates = await listWhatsAppTemplates();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not reach WhatsApp." }, { status: 409 });
  }
  const template = templates.find((t) => t.name === parsed.data.templateName);
  if (!template) return NextResponse.json({ error: "That template no longer exists." }, { status: 404 });
  if (template.status !== "APPROVED") {
    return NextResponse.json({ error: "Only an approved template can be sent to a list." }, { status: 409 });
  }
  if (template.category === "AUTHENTICATION") {
    return NextResponse.json({ error: "One-time-code templates cannot be sent to a list." }, { status: 409 });
  }

  const needed = templateVariables(templateBody(template)).length;
  const mappings = await getWhatsAppVariableMappings(template.name);
  if (mappings.length !== needed) return NextResponse.json({ error: "Set up every variable in WhatsApp → Templates before creating this campaign." }, { status: 409 });

  // A media template has to carry a file on every send, so a campaign
  // without one would fail on the first recipient.
  const mediaFormat = templateHeaderMedia(template);
  let mediaUrl: string | null = null;
  if (mediaFormat) {
    const stored = await getTemplateMedia(template.name).catch(() => null);
    mediaUrl = stored?.media_url || null;
    if (!mediaUrl) {
      return NextResponse.json(
        { error: "This template has a media header. Save a file for it on the Templates tab first." },
        { status: 409 },
      );
    }
  }

  const buttonIndex = dynamicUrlButtonIndex(template);
  const urlButton = buttonIndex !== null ? templateButtons(template).find((button, index) => index === buttonIndex) : null;
  const exampleUrl = urlButton?.type === "URL" ? urlButton.example?.[0] : null;
  const buttonBase = urlButton?.type === "URL" ? urlButton.url.replace(/\{\{1\}\}$/, "") : "";
  const buttonUrlParam = parsed.data.buttonUrlParam || (exampleUrl?.startsWith(buttonBase) ? exampleUrl.slice(buttonBase.length) : null);
  if (buttonIndex !== null && !buttonUrlParam) return NextResponse.json({ error: "Set the link button value in the template before creating this campaign." }, { status: 409 });

  const inserted = await pool.query<{ id: number }>(
    `INSERT INTO whatsapp_campaigns
       (name, template_name, language, category, variables, header_media_url, header_media_format, button_url_param, button_url_index, segment_id, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      parsed.data.name,
      template.name,
      template.language,
      template.category,
      JSON.stringify(parsed.data.variables),
      mediaUrl,
      mediaFormat,
      buttonIndex !== null ? buttonUrlParam : null,
      buttonIndex,
      parsed.data.segmentId,
      email,
    ],
  );

  return NextResponse.json({
    ok: true,
    id: inserted.rows[0].id,
    audience: await countCampaignAudience(segment.rules),
  });
}
