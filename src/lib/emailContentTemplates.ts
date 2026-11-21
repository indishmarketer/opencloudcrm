import { pool } from "@/lib/db";
import type { EmailBlock } from "@/lib/emailBlocks";
import { resolveEmailBodySave } from "@/lib/emailBlockSave";

export type TemplateCategory = "marketing" | "transactional";

export type EmailContentTemplate = {
  id: number;
  name: string;
  subject: string;
  body_html: string;
  /** Marketing = free-form/campaign content; Transactional = written for
   * a specific automation's email action (not tracked by default, sent in
   * response to one action rather than broadcast). Purely an organizing
   * tab on the Templates page -- nothing else in the app reads it. */
  category: TemplateCategory;
  /** Optional grouping on the Templates page. NULL sits in General. */
  folder: string | null;
  /** NULL means this template was never opened in the visual builder --
   * body_html is still hand-written/rich-text and is the source of truth.
   * Once set, body_html is regenerated from this on every save (see
   * renderedBody below), so every existing reader of body_html (sendEmail,
   * the campaign editor's template-copy) needs no changes at all. */
  blocks_json: EmailBlock[] | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type SaveInput = {
  name: string;
  subject: string;
  /** Ignored when `blocks` is provided -- the builder's rendered output
   * wins, since body_html is derived, not hand-authored, once a template
   * has opted into the visual builder. */
  bodyHtml: string;
  category?: TemplateCategory;
  folder?: string | null;
  /** Present only when saved from ConsoleEmailBuilder. Omit entirely (not
   * an empty array) for the plain rich-text editor's save path -- an
   * empty array is a real "I deleted every block," a genuinely blank
   * email, which the rich-text path can never produce. */
  blocks?: unknown;
};

/** Folders are free text the owner types, so trim them and treat blank
 * as "no folder" rather than storing an empty string that would show up
 * as its own nameless group. */
function normalizeFolder(folder: string | null | undefined): string | null {
  const trimmed = (folder ?? "").trim();
  return trimmed ? trimmed.slice(0, 60) : null;
}

export async function listContentTemplates(): Promise<EmailContentTemplate[]> {
  const result = await pool.query<EmailContentTemplate>(
    "SELECT id, name, subject, body_html, category, folder, blocks_json, created_at, updated_at, updated_by FROM email_content_templates ORDER BY name"
  );
  return result.rows;
}

export async function getContentTemplate(id: number): Promise<EmailContentTemplate | null> {
  const result = await pool.query<EmailContentTemplate>(
    "SELECT id, name, subject, body_html, category, folder, blocks_json, created_at, updated_at, updated_by FROM email_content_templates WHERE id = $1",
    [id]
  );
  return result.rows[0] || null;
}

export async function createContentTemplate(input: SaveInput, actor: string): Promise<EmailContentTemplate> {
  const { bodyHtml, blocks } = resolveEmailBodySave(input);
  const result = await pool.query<EmailContentTemplate>(
    `INSERT INTO email_content_templates (name, subject, body_html, category, folder, blocks_json, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     RETURNING id, name, subject, body_html, category, folder, blocks_json, created_at, updated_at, updated_by`,
    [input.name.trim(), input.subject, bodyHtml, input.category || "marketing", normalizeFolder(input.folder), blocks ? JSON.stringify(blocks) : null, actor]
  );
  return result.rows[0];
}

export async function updateContentTemplate(id: number, input: SaveInput, actor: string): Promise<EmailContentTemplate | null> {
  const { bodyHtml, blocks } = resolveEmailBodySave(input);
  // Omitted blocks leave the current layout alone; null explicitly switches
  // back to Classic/HTML, and an array replaces the visual layout.
  const blocksParam = blocks ? JSON.stringify(blocks) : null;
  const result = await pool.query<EmailContentTemplate>(
    `UPDATE email_content_templates
     SET name = $1, subject = $2, body_html = $3,
         category = COALESCE($4, category),
         folder = CASE WHEN $9::boolean THEN $10 ELSE folder END,
         blocks_json = CASE WHEN $8::boolean THEN $5::jsonb ELSE blocks_json END,
         updated_by = $6, updated_at = now()
     WHERE id = $7
     RETURNING id, name, subject, body_html, category, folder, blocks_json, created_at, updated_at, updated_by`,
    [input.name.trim(), input.subject, bodyHtml, input.category || null, blocksParam, actor, id, input.blocks !== undefined,
     input.folder !== undefined, normalizeFolder(input.folder)]
  );
  return result.rows[0] || null;
}

export async function deleteContentTemplate(id: number): Promise<boolean> {
  const result = await pool.query("DELETE FROM email_content_templates WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
