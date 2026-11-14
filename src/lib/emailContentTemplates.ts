import { pool } from "@/lib/db";
import { normalizeEmailBlocks, type EmailBlock } from "@/lib/emailBlocks";
import { renderEmailBlocksToHtml } from "@/lib/emailBlocksRender";

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
  /** Present only when saved from ConsoleEmailBuilder. Omit entirely (not
   * an empty array) for the plain rich-text editor's save path -- an
   * empty array is a real "I deleted every block," a genuinely blank
   * email, which the rich-text path can never produce. */
  blocks?: unknown;
};

/** `body_html` the DB should actually store for this save -- the
 * builder's own rendered output when blocks were provided, or the
 * caller's hand-written HTML otherwise. Also returns the normalized
 * blocks, so the same validation pass isn't duplicated between callers. */
function resolveBody(input: SaveInput): { bodyHtml: string; blocks: EmailBlock[] | null } {
  if (input.blocks === undefined) return { bodyHtml: input.bodyHtml, blocks: null };
  const blocks = normalizeEmailBlocks(input.blocks);
  return { bodyHtml: renderEmailBlocksToHtml(blocks), blocks };
}

export async function listContentTemplates(): Promise<EmailContentTemplate[]> {
  const result = await pool.query<EmailContentTemplate>(
    "SELECT id, name, subject, body_html, category, blocks_json, created_at, updated_at, updated_by FROM email_content_templates ORDER BY name"
  );
  return result.rows;
}

export async function getContentTemplate(id: number): Promise<EmailContentTemplate | null> {
  const result = await pool.query<EmailContentTemplate>(
    "SELECT id, name, subject, body_html, category, blocks_json, created_at, updated_at, updated_by FROM email_content_templates WHERE id = $1",
    [id]
  );
  return result.rows[0] || null;
}

export async function createContentTemplate(input: SaveInput, actor: string): Promise<EmailContentTemplate> {
  const { bodyHtml, blocks } = resolveBody(input);
  const result = await pool.query<EmailContentTemplate>(
    `INSERT INTO email_content_templates (name, subject, body_html, category, blocks_json, updated_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING id, name, subject, body_html, category, blocks_json, created_at, updated_at, updated_by`,
    [input.name.trim(), input.subject, bodyHtml, input.category || "marketing", blocks ? JSON.stringify(blocks) : null, actor]
  );
  return result.rows[0];
}

export async function updateContentTemplate(id: number, input: SaveInput, actor: string): Promise<EmailContentTemplate | null> {
  const { bodyHtml, blocks } = resolveBody(input);
  // A save from the plain rich-text editor (input.blocks undefined) must
  // not blank out blocks_json a prior builder session already set --
  // COALESCE keeps whatever's stored unless this save is actually a
  // builder save (blocks !== null here precisely when input.blocks was
  // provided; resolveBody only normalizes in that case).
  const blocksParam = blocks ? JSON.stringify(blocks) : null;
  const result = await pool.query<EmailContentTemplate>(
    `UPDATE email_content_templates
     SET name = $1, subject = $2, body_html = $3,
         category = COALESCE($4, category),
         blocks_json = COALESCE($5::jsonb, blocks_json),
         updated_by = $6, updated_at = now()
     WHERE id = $7
     RETURNING id, name, subject, body_html, category, blocks_json, created_at, updated_at, updated_by`,
    [input.name.trim(), input.subject, bodyHtml, input.category || null, blocksParam, actor, id]
  );
  return result.rows[0] || null;
}

export async function deleteContentTemplate(id: number): Promise<boolean> {
  const result = await pool.query("DELETE FROM email_content_templates WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
