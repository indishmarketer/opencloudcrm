import { graphVersion, normalizePhoneForWhatsApp } from "@/lib/whatsapp";
import { pool } from "@/lib/db";
import {
  HEADER_MEDIA_TYPES,
  isOtpCopyCodeButton,
  templateButtons,
  type MediaFormat,
  type TemplateButton,
  type TemplateCategory,
  type TemplateComponent,
  type WhatsAppTemplate,
  type WhatsAppPhoneNumber,
} from "@/lib/whatsappTemplateShape";

// Re-exported so existing imports of this module keep working: callers
// should not have to know which of the two files a given helper lives in.
export * from "@/lib/whatsappTemplateShape";

/** WhatsApp Business Account (WABA) management: templates and phone numbers.
 *
 * These calls are WABA-scoped (`/{waba_id}/...`), unlike the sending calls in
 * whatsapp.ts which are phone-number-scoped (`/{phone_number_id}/messages`).
 * They need the `whatsapp_business_management` scope on the access token.
 *
 * This exists so templates can be written, submitted and tracked from our own
 * console instead of Meta's dashboard, where the editor silently drops text
 * typed after an auto-inserted variable and the validation rules only surface
 * after a failed submit. */


function config(): { token: string; wabaId: string } | null {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaId = process.env.WHATSAPP_WABA_ID?.trim();
  return token && wabaId ? { token, wabaId } : null;
}

/** True when template management is configured; the console shows a setup
 * notice rather than a broken page when it isn't. */
export function isWhatsAppManagementConfigured(): boolean {
  return config() !== null;
}

async function graph<T>(
  path: string,
  init?: { method?: string; body?: unknown; searchParams?: Record<string, string> },
): Promise<T> {
  const c = config();
  if (!c) throw new Error("WhatsApp management is not configured.");
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${path}`);
  for (const [key, value] of Object.entries(init?.searchParams || {})) url.searchParams.set(key, value);

  const res = await fetch(url, {
    method: init?.method || "GET",
    headers: {
      Authorization: `Bearer ${c.token}`,
      "Content-Type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    // Meta's error bodies are nested and the useful part is `message`.
    const error = data?.error as { message?: string; error_user_msg?: string } | undefined;
    throw new Error(error?.error_user_msg || error?.message || `WhatsApp API error ${res.status}`);
  }
  return data as T;
}

/** Uploads the sample image/video/PDF that a media-header template is
 * reviewed against, and returns Meta's file handle for it.
 *
 * Two steps, and the second one is easy to get wrong: the session is opened
 * against the *app* id (not the WABA), and the upload itself authenticates
 * with `OAuth <token>` rather than the `Bearer <token>` every other Graph
 * call uses. The handle this returns goes in the template's
 * `example.header_handle`; it identifies the sample only, so each real
 * message still supplies its own media when it is sent. */
export async function uploadTemplateMediaSample(file: {
  bytes: ArrayBuffer;
  type: string;
  name: string;
}): Promise<string> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const appId = process.env.WHATSAPP_APP_ID?.trim();
  if (!token || !appId) throw new Error("WhatsApp media upload is not configured (needs WHATSAPP_APP_ID).");

  const allowed = HEADER_MEDIA_TYPES[file.type];
  if (!allowed) throw new Error("Use a JPEG, PNG, MP4 or PDF.");
  if (file.bytes.byteLength > allowed.maxBytes) {
    throw new Error(`That file is too big. Limit is ${Math.round(allowed.maxBytes / (1024 * 1024))}MB for this type.`);
  }

  const start = new URL(`https://graph.facebook.com/${graphVersion()}/${appId}/uploads`);
  start.searchParams.set("file_name", file.name);
  start.searchParams.set("file_length", String(file.bytes.byteLength));
  start.searchParams.set("file_type", file.type);
  const startRes = await fetch(start, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const startBody = (await startRes.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!startRes.ok || !startBody?.id) {
    throw new Error(startBody?.error?.message || "Could not start the upload with Meta.");
  }

  const uploadRes = await fetch(`https://graph.facebook.com/${graphVersion()}/${startBody.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      file_offset: "0",
      "Content-Type": file.type,
    },
    body: file.bytes,
  });
  const uploadBody = (await uploadRes.json().catch(() => null)) as { h?: string; error?: { message?: string } } | null;
  if (!uploadRes.ok || !uploadBody?.h) {
    throw new Error(uploadBody?.error?.message || "Meta did not accept the file.");
  }
  return uploadBody.h;
}

/** Every template, following Meta's paging cursors.
 *
 * The first version asked for 200 and ignored `paging.next`, so template
 * 201 simply did not exist as far as the console was concerned -- and a
 * template missing from the list is a template that cannot be edited,
 * tested or sent from here. The page walk is capped so a runaway cursor
 * cannot loop forever. */
export async function listWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  const c = config();
  if (!c) return [];
  const all: WhatsAppTemplate[] = [];
  let after: string | undefined;

  for (let page = 0; page < 20; page++) {
    const result = await graph<{ data: WhatsAppTemplate[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `${c.wabaId}/message_templates`,
      {
        searchParams: {
          fields: "id,name,status,category,language,components,rejected_reason",
          limit: "100",
          ...(after ? { after } : {}),
        },
      },
    );
    all.push(...(result.data || []));
    // `next` is the thing to test: Meta keeps returning a cursor on the
    // last page, so following the cursor alone never terminates.
    if (!result.paging?.next || !result.paging?.cursors?.after) break;
    after = result.paging.cursors.after;
  }
  return all;
}

/** The same list, cached for a minute, for paths that only need a
 * template's wording rather than its live review status.
 *
 * The thread renderer needs it because a template send is stored as its
 * name and the values it was filled with, never the finished text -- so
 * every render rebuilds the words from the approved template. That was
 * fine when a thread rendered once per page load; it is not fine now that
 * an open thread polls every five seconds, which turned into a paged Graph
 * API call to Meta every five seconds per reader.
 *
 * Deliberately not applied to listWhatsAppTemplates itself: the Templates
 * tab has to show a template the moment it is created or edited. */
let renderTemplateCache: { templates: WhatsAppTemplate[]; expiresAt: number } | null = null;
export async function templatesForRendering(): Promise<WhatsAppTemplate[]> {
  if (renderTemplateCache && renderTemplateCache.expiresAt > Date.now()) return renderTemplateCache.templates;
  const templates = await listWhatsAppTemplates();
  renderTemplateCache = { templates, expiresAt: Date.now() + 60_000 };
  return templates;
}

export async function listWhatsAppPhoneNumbers(): Promise<WhatsAppPhoneNumber[]> {
  const c = config();
  if (!c) return [];
  const all: WhatsAppPhoneNumber[] = [];
  let after: string | undefined;

  for (let page = 0; page < 20; page++) {
    const result = await graph<{
      data?: WhatsAppPhoneNumber[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`${c.wabaId}/phone_numbers`, {
      searchParams: {
        fields:
          "id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status,status,name_status,new_name_status",
        limit: "100",
        ...(after ? { after } : {}),
      },
    });
    all.push(...(result.data || []));
    if (!result.paging?.next || !result.paging?.cursors?.after) break;
    after = result.paging.cursors.after;
  }

  return all;
}

/** `POST /{waba}/phone_numbers` -- creating a phone number resource via API
 * is gated to Tech Provider/BSP relationships. For a business managing its own
 * WABA directly, Meta requires numbers to be added and verified inside Meta
 * WhatsApp Manager in Meta Business Suite. Once verified there, numbers sync
 * automatically. */

/** Finishes Cloud API registration after Embedded Signup hands back a
 * verified phone_number_id. `pin` is the number's two-step verification
 * PIN -- a fresh 6-digit code if it has never had one, or its existing PIN
 * if it does (Meta rejects a mismatch here, it does not reset it). Only
 * after this step can the number send and receive. */
export async function registerWhatsAppPhoneNumber(phoneNumberId: string, pin: string): Promise<void> {
  await graph(`${phoneNumberId}/register`, {
    method: "POST",
    body: { messaging_product: "whatsapp", pin },
  });
}

export type WhatsAppCost = {
  /** null when Meta has no currency set for the account yet. */
  currency: string | null;
  byCategory: { category: string; cost: number; volume: number }[];
  total: number;
};

/** The one real billed figure Meta exposes via API: `pricing_analytics`
 * with `metric_types: ["COST", "VOLUME"]`, in the WABA's own billing currency.
 * Meta shifted from session-based conversation analytics to per-message pricing analytics.
 * Dimensions: PRICING_CATEGORY returns MARKETING, UTILITY, AUTHENTICATION, SERVICE. */
export async function conversationCost(days: number): Promise<WhatsAppCost> {
  const c = config();
  if (!c) return { currency: null, byCategory: [], total: 0 };

  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 86400;
  const fields =
    `currency,pricing_analytics.start(${start}).end(${end}).granularity(DAILY)` +
    `.metric_types(["COST","VOLUME"]).dimensions(["PRICING_CATEGORY"])`;

  const result = await graph<{
    currency?: string;
    pricing_analytics?: {
      data?: Array<{
        data_points?: Array<{ cost?: number; volume?: number; pricing_category?: string }>;
      }>;
    };
  }>(c.wabaId, { searchParams: { fields } });

  const byCategory = new Map<string, { cost: number; volume: number }>();
  for (const series of result.pricing_analytics?.data || []) {
    for (const point of series.data_points || []) {
      const category = (point.pricing_category || "UNKNOWN").toUpperCase();
      const cost = Number(point.cost) || 0;
      const volume = Number(point.volume) || 0;
      const existing = byCategory.get(category) || { cost: 0, volume: 0 };
      byCategory.set(category, {
        cost: existing.cost + cost,
        volume: existing.volume + volume,
      });
    }
  }

  const rows = [...byCategory.entries()].map(([category, { cost, volume }]) => ({ category, cost, volume }));
  rows.sort((a, b) => b.cost - a.cost);

  return {
    currency: result.currency || "INR",
    byCategory: rows,
    total: rows.reduce((sum, row) => sum + row.cost, 0),
  };
}

/** Everything a template is made of, apart from its name, category and
 * language (which an edit cannot change). Shared by create and edit so the
 * two cannot drift apart -- they have to build byte-identical components or
 * an edit silently drops whatever the newer one knows about. */
export type TemplateDraft = {
  body: string;
  samples: string[];
  category?: TemplateCategory;
  authentication?: {
    addSecurityRecommendation: boolean;
    codeExpirationMinutes: number | null;
  };
  header?: string | null;
  /** Media header: the format plus the handle from uploadTemplateMediaSample. */
  headerMedia?: { format: MediaFormat; handle: string } | null;
  footer?: string | null;
  buttons?: TemplateButton[] | null;
};

function buildComponents(input: TemplateDraft): TemplateComponent[] {
  if (input.category === "AUTHENTICATION") {
    const minutes = input.authentication?.codeExpirationMinutes ?? null;
    return [
      {
        type: "BODY",
        add_security_recommendation: input.authentication?.addSecurityRecommendation ?? true,
      },
      ...(minutes ? [{ type: "FOOTER" as const, code_expiration_minutes: minutes }] : []),
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] },
    ];
  }

  const components: TemplateComponent[] = [];
  if (input.headerMedia) {
    components.push({
      type: "HEADER",
      format: input.headerMedia.format,
      example: { header_handle: [input.headerMedia.handle] },
    });
  } else if (input.header?.trim()) {
    components.push({ type: "HEADER", format: "TEXT", text: input.header.trim() });
  }
  components.push({
    type: "BODY",
    text: input.body.trim(),
    // Meta wants one row of example values, one entry per variable.
    ...(input.samples.length ? { example: { body_text: [input.samples] } } : {}),
  });
  if (input.footer?.trim()) {
    components.push({ type: "FOOTER", text: input.footer.trim() });
  }
  // All buttons live in one BUTTONS component, in order; Meta rejects more
  // than one such component.
  if (input.buttons?.length) {
    components.push({ type: "BUTTONS", buttons: input.buttons });
  }
  return components;
}

export async function createWhatsAppTemplate(
  input: TemplateDraft & {
    name: string;
    category: TemplateCategory;
    language: string;
  },
): Promise<{ id: string; status: string }> {
  const c = config();
  if (!c) throw new Error("WhatsApp management is not configured.");

  const components = buildComponents(input);

  return graph<{ id: string; status: string }>(`${c.wabaId}/message_templates`, {
    method: "POST",
    body: {
      name: input.name,
      category: input.category,
      language: input.language,
      components,
    },
  });
}

/** The account phone-code sender uses the template assigned to this group
 * in the WhatsApp console. The group is our explicit selection, so ordinary
 * Authentication templates used by other features cannot be picked by
 * accident. */
export const ACCOUNT_PHONE_OTP_GROUP = "Account phone verification";

export async function getAccountPhoneOtpTemplate(): Promise<{ name: string; language: string } | null> {
  const [templates, groups] = await Promise.all([listWhatsAppTemplates(), listTemplateGroups()]);
  const names = new Set(
    Object.entries(groups)
      .filter(([, memberships]) => memberships.some((group) => group.toLowerCase() === ACCOUNT_PHONE_OTP_GROUP.toLowerCase()))
      .map(([name]) => name),
  );
  const eligible = templates.filter((template) =>
    names.has(template.name) &&
    template.status === "APPROVED" &&
    template.category === "AUTHENTICATION" &&
    templateButtons(template).some(isOtpCopyCodeButton),
  );
  if (eligible.length === 1) {
    return { name: eligible[0].name, language: eligible[0].language };
  }

  // The console currently creates templates in English. If an English copy
  // is assigned alongside other locales, use that one deterministically.
  const english = eligible.filter((template) => template.language === "en");
  return english.length === 1 ? { name: english[0].name, language: english[0].language } : null;
}

/** Edits an existing template, which puts it straight back into review:
 * Meta sets it to PENDING again and the old wording keeps sending until the
 * new one is approved. Name and language cannot be changed (make a copy
 * instead), and a template cannot be edited while already PENDING. */
export async function updateWhatsAppTemplate(templateId: string, input: TemplateDraft): Promise<void> {
  const c = config();
  if (!c) throw new Error("WhatsApp management is not configured.");

  const components = buildComponents(input);

  // Meta answers 200 with {"success": true}; anything else is a refusal it
  // reports in the body rather than the status, so checking only res.ok
  // turns a rejected edit into a silent no-op that looks like it saved.
  const result = await graph<{ success?: boolean }>(templateId, { method: "POST", body: { components } });
  if (result?.success !== true) {
    throw new Error(
      `WhatsApp did not apply the edit: ${JSON.stringify(result).slice(0, 300)}. ` +
        "If it keeps refusing, make a copy and submit that instead.",
    );
  }

  // ...and "success" is not enough either. Meta returns it for an edit to a
  // template that is still in review and then keeps the old wording
  // (verified 2026-10-22). Read the template back and insist the new body
  // is really there, so the console never claims a save that didn't happen.
  const after = await graph<{ components?: TemplateComponent[] }>(templateId, {
    searchParams: { fields: "components" },
  }).catch(() => null);
  const savedBody = after?.components?.find((c) => c.type === "BODY")?.text;
  if (savedBody !== undefined && savedBody.trim() !== input.body.trim()) {
    throw new Error(
      "WhatsApp accepted the edit but kept the previous wording. This happens while a template is still in " +
        "review -- wait until it is approved and edit again, or make a copy and submit that instead.",
    );
  }
}

/** Remembers which file in R2 a media template should send. */
export async function saveTemplateMedia(
  templateName: string,
  mediaUrl: string,
  format: MediaFormat,
): Promise<void> {
  await pool.query(
    `INSERT INTO whatsapp_template_media (template_name, media_url, format)
     VALUES ($1, $2, $3)
     ON CONFLICT (template_name) DO UPDATE SET
       media_url = EXCLUDED.media_url, format = EXCLUDED.format, updated_at = now()`,
    [templateName, mediaUrl, format],
  );
}

export async function getTemplateMedia(
  templateName: string,
): Promise<{ media_url: string; format: MediaFormat } | null> {
  const result = await pool.query<{ media_url: string; format: MediaFormat }>(
    "SELECT media_url, format FROM whatsapp_template_media WHERE template_name = $1",
    [templateName],
  );
  return result.rows[0] ?? null;
}

/** Every stored media pointer, so the template list can show each one
 * without a query per row. */
export async function listTemplateMedia(): Promise<Record<string, string>> {
  const result = await pool.query<{ template_name: string; media_url: string }>(
    "SELECT template_name, media_url FROM whatsapp_template_media",
  );
  return Object.fromEntries(result.rows.map((r) => [r.template_name, r.media_url]));
}

/** Our own grouping for a template ("Bookings", "Courses", "Newsletter").
 * Meta has no concept of it: its own categories are about billing and
 * review, not about what the message is for on this site. A template can
 * sit in several groups at once, so these are membership rows rather than
 * one label per template. */
export async function setTemplateGroup(templateName: string, groupName: string, member: boolean): Promise<void> {
  const trimmed = groupName.trim().slice(0, 40);
  if (!trimmed) return;
  if (!member) {
    await pool.query(
      "DELETE FROM whatsapp_template_groups WHERE template_name = $1 AND lower(group_name) = lower($2)",
      [templateName, trimmed],
    );
    return;
  }
  await pool.query(
    `INSERT INTO whatsapp_template_groups (template_name, group_name) VALUES ($1, $2)
     ON CONFLICT (template_name, group_name) DO NOTHING`,
    [templateName, trimmed],
  );
}

/** Renames a group everywhere at once. Nothing stops two groups differing
 * only in case, so the match ignores it: "bookings" and "Bookings" are the
 * same group to anyone reading the list. */
export async function renameTemplateGroup(from: string, to: string): Promise<void> {
  const target = to.trim().slice(0, 40);
  if (!from.trim() || !target) return;
  await pool.query(
    `UPDATE whatsapp_template_groups SET group_name = $2
     WHERE lower(group_name) = lower($1)
       AND NOT EXISTS (
         SELECT 1 FROM whatsapp_template_groups existing
         WHERE existing.template_name = whatsapp_template_groups.template_name
           AND lower(existing.group_name) = lower($2)
       )`,
    [from.trim(), target],
  );
  // Anything left is a template already in both groups, so the rename is a
  // merge for it and the old row is simply dropped.
  await pool.query("DELETE FROM whatsapp_template_groups WHERE lower(group_name) = lower($1)", [from.trim()]);
}

/** Removes a group. Only the grouping goes: the templates themselves live at
 * Meta and are untouched. */
export async function deleteTemplateGroup(groupName: string): Promise<void> {
  if (!groupName.trim()) return;
  await pool.query("DELETE FROM whatsapp_template_groups WHERE lower(group_name) = lower($1)", [groupName.trim()]);
}

/** Every template's groups, keyed by template name. */
export async function listTemplateGroups(): Promise<Record<string, string[]>> {
  const result = await pool.query<{ template_name: string; group_name: string }>(
    "SELECT template_name, group_name FROM whatsapp_template_groups ORDER BY group_name",
  );
  const out: Record<string, string[]> = {};
  for (const row of result.rows) {
    (out[row.template_name] ||= []).push(row.group_name);
  }
  return out;
}

export async function deleteWhatsAppTemplate(name: string): Promise<void> {
  const c = config();
  if (!c) throw new Error("WhatsApp management is not configured.");
  await graph(`${c.wabaId}/message_templates`, { method: "DELETE", searchParams: { name } });
  // Our own rows for it are keyed by name, so leaving them behind would
  // attach the old groups and media file to a future template that happens
  // to reuse the name.
  await pool.query("DELETE FROM whatsapp_template_groups WHERE template_name = $1", [name]).catch(() => {});
  await pool.query("DELETE FROM whatsapp_template_media WHERE template_name = $1", [name]).catch(() => {});
}

export { normalizePhoneForWhatsApp };

/** The profile customers see when they tap the business name in a chat:
 * the picture, what the business does, and how else to reach it.
 *
 * Per phone number, not per account -- two numbers on the same WhatsApp
 * Business Account have completely separate profiles, which is why one can
 * look filled in while the other looks empty. */
export type WhatsAppBusinessProfile = {
  about?: string | null;
  address?: string | null;
  description?: string | null;
  email?: string | null;
  vertical?: string | null;
  websites?: string[] | null;
  profile_picture_url?: string | null;
};

const PROFILE_FIELDS = "about,address,description,email,profile_picture_url,websites,vertical";

export async function getWhatsAppBusinessProfile(phoneNumberId: string): Promise<WhatsAppBusinessProfile> {
  const result = await graph<{ data?: WhatsAppBusinessProfile[] }>(`${phoneNumberId}/whatsapp_business_profile`, {
    searchParams: { fields: PROFILE_FIELDS },
  });
  return result.data?.[0] || {};
}

/** Only fields with something in them are sent on.
 *
 * Meta rejects an empty `about` outright -- a bare (#131000) "Something
 * went wrong" with nothing to act on -- and an empty value for the others
 * would quietly wipe a real description or address. So a blank field here
 * means "leave whatever is there", which is also the safer default for a
 * form someone opens to change one line. */
export async function updateWhatsAppBusinessProfile(
  phoneNumberId: string,
  input: WhatsAppBusinessProfile & { profile_picture_handle?: string },
): Promise<void> {
  const body: Record<string, unknown> = { messaging_product: "whatsapp" };
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || key === "profile_picture_url") continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    body[key] = value;
  }
  await graph(`${phoneNumberId}/whatsapp_business_profile`, { method: "POST", body });
}
