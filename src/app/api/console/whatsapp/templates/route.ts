import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
// Every upstream failure below answers 409, never 502/503/504: Cloudflare
// replaces those gateway codes with its own HTML error page, which costs us
// the one thing that matters here -- Meta's actual reason for refusing a
// template. The same trap is documented in the Razorpay webhook route.
import {
  createWhatsAppTemplate,
  deleteWhatsAppTemplate,
  listWhatsAppTemplates,
  saveTemplateMedia,
  templateBody,
  updateWhatsAppTemplate,
  validateTemplateDraft,
} from "@/lib/whatsappTemplates";
import { templateVariables } from "@/lib/whatsappTemplateShape";
import {
  listWhatsAppVariableSources,
  saveWhatsAppVariableMappings,
  type WhatsAppVariableMapping,
} from "@/lib/whatsappVariableMappings";

/** Buttons, validated loosely here and properly in validateTemplateButtons:
 * the url is a plain string because it may legitimately contain a {{1}}
 * placeholder, which a strict URL check rejects. */
const ButtonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().trim().min(1).max(25) }),
  z.object({
    type: z.literal("URL"),
    text: z.string().trim().min(1).max(25),
    url: z.string().trim().min(1).max(2000),
    example: z.array(z.string().trim().max(2000)).max(1).optional(),
  }),
  z.object({
    type: z.literal("PHONE_NUMBER"),
    text: z.string().trim().min(1).max(25),
    phone_number: z.string().trim().min(5).max(20),
  }),
]);

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(512),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]),
  language: z.string().trim().min(2).max(10),
  body: z.string().max(1024).optional(),
  samples: z.array(z.string().trim().max(200)).max(20).optional(),
  variableMappings: z.array(z.object({
    position: z.number().int().min(1).max(20),
    sourceKey: z.string().trim().max(300),
    fixedValue: z.string().max(500).nullable().optional(),
  }).strict()).max(20).optional(),
  authentication: z.object({
    addSecurityRecommendation: z.boolean(),
    codeExpirationMinutes: z.number().int().min(1).max(90).nullable(),
  }).strict().optional(),
  header: z.string().trim().max(60).optional(),
  headerMedia: z.object({
    format: z.enum(["IMAGE", "VIDEO", "DOCUMENT"]),
    handle: z.string().trim().min(1).max(2000),
    /** Where the same file lives in R2, for the template's real sends. */
    url: z.string().trim().url().max(2000).optional(),
  }).optional(),
  footer: z.string().trim().max(60).optional(),
  buttons: z.array(ButtonSchema).max(10).optional(),
}).strict();

const UpdateSchema = CreateSchema.omit({ name: true, category: true, language: true }).extend({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(512),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]),
  mappingOnly: z.boolean().optional(),
}).strict();

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [templates, mappings] = await Promise.all([
      listWhatsAppTemplates(),
      pool.query<{ template_name: string; variable_position: number; source_key: string; fixed_value: string | null }>(
        "SELECT template_name, variable_position, source_key, fixed_value FROM whatsapp_template_variable_mappings ORDER BY template_name, variable_position",
      ),
    ]);
    const byName = new Map<string, WhatsAppVariableMapping[]>();
    for (const row of mappings.rows) byName.set(row.template_name, [...(byName.get(row.template_name) || []), { position: row.variable_position, sourceKey: row.source_key, fixedValue: row.fixed_value }]);
    return NextResponse.json({ templates: templates.map((template) => ({ ...template, variableMappings: byName.get(template.name) || [] })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load templates." }, { status: 409 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid template details." }, { status: 400 });

  const input = parsed.data;
  if (input.category === "AUTHENTICATION") {
    if (input.header || input.headerMedia || input.footer || input.buttons?.length || input.body || input.samples?.length) {
      return NextResponse.json({ error: "Authentication templates use Meta's preset message and OTP button." }, { status: 400 });
    }
  } else {
    if (!input.body) return NextResponse.json({ error: "Enter the message text." }, { status: 400 });
    input.samples = await ensureSamplesFromMappings(input.body, input.samples || [], input.variableMappings || []);
    const problem = validateTemplateDraft({ ...input, body: input.body, samples: input.samples || [] });
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const mappingProblem = await validateVariableMappings(input.body, input.variableMappings || []);
    if (mappingProblem) return NextResponse.json({ error: mappingProblem }, { status: 400 });
  }

  try {
    const created = await createWhatsAppTemplate({ ...input, body: input.body || "", samples: input.samples || [] });
    const media = input.headerMedia;
    if (media?.url) await saveTemplateMedia(input.name, media.url, media.format);
    await saveWhatsAppVariableMappings(input.name, input.variableMappings || []);
    return NextResponse.json({ ok: true, ...created });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not submit template." }, { status: 409 });
  }
}

/** Editing sends the template back for review; the previous version keeps
 * sending until Meta approves the new one. */
export async function PATCH(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid template details." }, { status: 400 });

  const input = parsed.data;
  const existing = (await listWhatsAppTemplates()).find((template) => template.id === input.id);
  if (!existing || existing.category !== input.category || existing.name !== input.name) {
    return NextResponse.json({ error: "Template details changed. Refresh the page and try again." }, { status: 409 });
  }
  if (input.mappingOnly) {
    const existingBody = templateBody(existing);
    const mappingProblem = await validateVariableMappings(existingBody, input.variableMappings || []);
    if (mappingProblem) return NextResponse.json({ error: mappingProblem }, { status: 400 });
    await saveWhatsAppVariableMappings(input.name, input.variableMappings || []);
    return NextResponse.json({ ok: true, mappingsSaved: true });
  }
  if (input.category === "AUTHENTICATION") {
    if (input.header || input.headerMedia || input.footer || input.buttons?.length || input.body || input.samples?.length) {
      return NextResponse.json({ error: "Authentication templates use Meta's preset message and OTP button." }, { status: 400 });
    }
  } else {
    if (!input.body) return NextResponse.json({ error: "Enter the message text." }, { status: 400 });
    input.samples = await ensureSamplesFromMappings(input.body, input.samples || [], input.variableMappings || []);
    const problem = validateTemplateDraft({
      name: input.name,
      body: input.body,
      samples: input.samples || [],
      buttons: input.buttons,
    });
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const mappingProblem = await validateVariableMappings(input.body, input.variableMappings || []);
    if (mappingProblem) return NextResponse.json({ error: mappingProblem }, { status: 400 });
  }

  try {
    await updateWhatsAppTemplate(input.id, { ...input, body: input.body || "", samples: input.samples || [] });
    const media = input.headerMedia;
    if (media?.url) await saveTemplateMedia(input.name, media.url, media.format);
    await saveWhatsAppVariableMappings(input.name, input.variableMappings || []);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not update template." }, { status: 409 });
  }
}

async function ensureSamplesFromMappings(
  body: string,
  samples: string[] = [],
  mappings: WhatsAppVariableMapping[] = [],
): Promise<string[]> {
  const vars = templateVariables(body);
  if (!vars.length) return [];
  const sources = await listWhatsAppVariableSources();
  const sourceByKey = new Map(sources.map((s) => [s.key, s]));
  return vars.map((pos, idx) => {
    const explicit = samples[idx]?.trim();
    if (explicit) return explicit;
    const mapping = mappings.find((m) => m.position === pos);
    if (mapping?.sourceKey === "custom") return mapping.fixedValue?.trim() || "";
    if (mapping?.sourceKey) {
      const src = sourceByKey.get(mapping.sourceKey);
      return src?.exampleValue || src?.value || "";
    }
    return "";
  });
}

async function validateVariableMappings(body: string, mappings: WhatsAppVariableMapping[]): Promise<string | null> {
  const expected = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  if (mappings.length !== expected.length || mappings.some((mapping, index) => mapping.position !== expected[index])) {
    return "Choose a data source for every message variable.";
  }
  const sources = new Set((await listWhatsAppVariableSources()).map((source) => source.key));
  for (const mapping of mappings) {
    if (!mapping.sourceKey) return `Choose a data source for {{${mapping.position}}}.`;
    if (!sources.has(mapping.sourceKey)) return "One of the selected data sources is no longer available. Refresh and choose it again.";
    if (mapping.sourceKey === "custom" && !mapping.fixedValue?.trim()) return `Enter the fixed value for {{${mapping.position}}}.`;
  }
  return null;
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = new URL(req.url).searchParams.get("name");
  if (!name) return NextResponse.json({ error: "Which template?" }, { status: 400 });
  try {
    await deleteWhatsAppTemplate(name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not delete template." }, { status: 409 });
  }
}
