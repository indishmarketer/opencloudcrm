import { pool } from "@/lib/db";

export type EmailContentTemplate = {
  id: number;
  name: string;
  subject: string;
  body_html: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export async function listContentTemplates(): Promise<EmailContentTemplate[]> {
  const result = await pool.query<EmailContentTemplate>(
    "SELECT id, name, subject, body_html, created_at, updated_at, updated_by FROM email_content_templates ORDER BY name"
  );
  return result.rows;
}

export async function getContentTemplate(id: number): Promise<EmailContentTemplate | null> {
  const result = await pool.query<EmailContentTemplate>(
    "SELECT id, name, subject, body_html, created_at, updated_at, updated_by FROM email_content_templates WHERE id = $1",
    [id]
  );
  return result.rows[0] || null;
}

export async function createContentTemplate(
  input: { name: string; subject: string; bodyHtml: string },
  actor: string
): Promise<EmailContentTemplate> {
  const result = await pool.query<EmailContentTemplate>(
    `INSERT INTO email_content_templates (name, subject, body_html, updated_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, subject, body_html, created_at, updated_at, updated_by`,
    [input.name.trim(), input.subject, input.bodyHtml, actor]
  );
  return result.rows[0];
}

export async function updateContentTemplate(
  id: number,
  input: { name: string; subject: string; bodyHtml: string },
  actor: string
): Promise<EmailContentTemplate | null> {
  const result = await pool.query<EmailContentTemplate>(
    `UPDATE email_content_templates
     SET name = $1, subject = $2, body_html = $3, updated_by = $4, updated_at = now()
     WHERE id = $5
     RETURNING id, name, subject, body_html, created_at, updated_at, updated_by`,
    [input.name.trim(), input.subject, input.bodyHtml, actor, id]
  );
  return result.rows[0] || null;
}

export async function deleteContentTemplate(id: number): Promise<boolean> {
  const result = await pool.query("DELETE FROM email_content_templates WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
