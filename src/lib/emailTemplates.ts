import { pool } from "@/lib/db";
import { getBusiness } from "@/lib/businessProfile";
import { SITE_NAME } from "@/config/brand";
import { escapeHtml } from "@/lib/escapeHtml";
import type { EmailBlock } from "@/lib/emailBlocks";
import { resolveEmailBodySave } from "@/lib/emailBlockSave";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailTemplate = {
  key: string;
  category: string;
  label: string;
  description: string;
  subject: string;
  body_html: string;
  from_email: string;
  critical: boolean;
  track_opens: boolean;
  allowed_vars: string[];
  /** The visual builder's structured blocks, same as
   * email_content_templates.blocks_json (migration 184) -- NULL means this
   * row was never opened in the builder; body_html is hand-written and is
   * the source of truth. */
  blocks_json: EmailBlock[] | null;
};

/** Raw {{var}} substitution -- does NOT escape values. Every var passed in
 * must already be HTML-safe (escapeHtml'd, or a hardcoded safe string),
 * exactly like the inline template literals this system replaces. This is
 * deliberately different from emailAutomation.ts's `applyVars`, which
 * auto-escapes -- that's correct for plain-text vars like course_title, but
 * would double-escape the pre-built HTML fragments (message/topics/etc)
 * several of these fixed-email templates take as vars. */
export function applyTemplateVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

/** Loads one email_templates row, throwing if it's gone. Every row in this
 * table is deletable now (see getEmailTemplateOptional, used by every
 * app-internal call site instead) -- this throwing variant exists only for
 * /api/v1/email/:key, a generic passthrough that already catches the throw
 * itself and reports 404. */
export async function getEmailTemplate(key: string): Promise<EmailTemplate> {
  const result = await pool.query<EmailTemplate>(
    `SELECT key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars, blocks_json
     FROM email_templates WHERE key = $1`,
    [key]
  );
  const row = result.rows[0];
  if (!row) throw new Error(`No email_templates row for key "${key}".`);
  // {{site_name}} is resolved here, before the caller applies its own vars,
  // so every seeded template can reference the deployment's own business
  // name instead of a hardcoded one -- and so call sites never need to know
  // this placeholder exists. Only {{site_name}} is touched; any other
  // {{var}} the caller still needs to fill is left untouched.
  const business = await getBusiness();
  const siteName = escapeHtml(business.brand || SITE_NAME);
  return {
    ...row,
    subject: row.subject.replace(/\{\{site_name\}\}/g, siteName),
    body_html: row.body_html.replace(/\{\{site_name\}\}/g, siteName),
  };
}

/** Like getEmailTemplate, but used by every app-internal call site (every
 * email_templates row is deletable now). Returns null instead of throwing
 * when the row is gone, so the surrounding logic -- granting a course, an
 * auth flow's generic response, a fire-and-forget invite -- still
 * completes; each call site decides what "no content configured" means for
 * it (skip silently, raise an admin alert, fall back to a logged link,
 * etc. -- see each call site's own comment). */
export async function getEmailTemplateOptional(key: string): Promise<EmailTemplate | null> {
  const result = await pool.query<EmailTemplate>(
    `SELECT key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars, blocks_json
     FROM email_templates WHERE key = $1`,
    [key]
  );
  const row = result.rows[0];
  if (!row) return null;
  const business = await getBusiness();
  const siteName = escapeHtml(business.brand || SITE_NAME);
  return {
    ...row,
    subject: row.subject.replace(/\{\{site_name\}\}/g, siteName),
    body_html: row.body_html.replace(/\{\{site_name\}\}/g, siteName),
  };
}

export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  const result = await pool.query<EmailTemplate>(
    `SELECT key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars, blocks_json
     FROM email_templates ORDER BY category, label`
  );
  return result.rows;
}

/** Loads one row exactly as stored, for the console's own editors --
 * unlike getEmailTemplate/getEmailTemplateOptional, this does NOT resolve
 * {{site_name}}, since an admin editing the content should see and keep
 * the literal placeholder, not today's resolved value. */
export async function getRawEmailTemplate(key: string): Promise<EmailTemplate | null> {
  const result = await pool.query<EmailTemplate>(
    `SELECT key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars, blocks_json
     FROM email_templates WHERE key = $1`,
    [key]
  );
  return result.rows[0] || null;
}

export class EmailTemplateUpdateError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export class EmailTemplateDeleteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export class EmailTemplateCreateError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** The fixed set of keys real code actually looks up by name (see
 * getEmailTemplateOptional's callers). An arbitrary new key would never be
 * read by anything, so "create" is a picker over this list, not a
 * free-text field -- these rows are fully deletable like any other email
 * (nothing in this app treats any key as permanent), this list exists only
 * so a self-hoster can bring one back once it's gone. */
export const SYSTEM_EMAIL_DEFS = [
  { key: "otp-code", label: "Verification code (OTP)", description: "Sent to confirm an email address with a short code or magic link (contact form, newsletter, etc).", allowedVars: ["code", "magic_link_url"], defaultSubject: "Your verification code", defaultBody: "<p>Your code: <strong>{{code}}</strong></p><p>Or click: <a href=\"{{magic_link_url}}\">Confirm now</a></p>" },
  { key: "contact-form-reply", label: "Contact form reply envelope", description: "The envelope used when an admin replies to a contact form message -- {{message}} is the admin's own typed reply.", allowedVars: ["name", "message"], defaultSubject: "Re: your message", defaultBody: "<p>Hi {{name}},</p><p>{{message}}</p>" },
  { key: "review-question-to-author", label: "Review question envelope", description: "The envelope used when an admin asks a reviewer a question -- {{note}} is the admin's own typed question.", allowedVars: ["name", "note"], defaultSubject: "A question about your review", defaultBody: "<p>Hi {{name}},</p><p>{{note}}</p>" },
  { key: "webinar-guest-signin", label: "Webinar guest sign-in link", description: "Sent to a guest registering for a webinar without an existing account, to verify and sign them in.", allowedVars: ["first_name", "webinar_title", "verify_url"], defaultSubject: "Confirm your spot in {{webinar_title}}", defaultBody: "<p>Hi {{first_name}},</p><p>Confirm your email to join {{webinar_title}}:</p><p><a href=\"{{verify_url}}\">Confirm and join</a></p>" },
] as const;

export function canDeleteEmailTemplate(_template: Pick<EmailTemplate, "key" | "critical">): boolean {
  return true;
}

export async function deleteEmailTemplate(key: string): Promise<void> {
  try {
    const deleted = await pool.query("DELETE FROM email_templates WHERE key = $1", [key]);
    if (!deleted.rowCount) throw new EmailTemplateDeleteError("Template not found.", 404);
  } catch (error) {
    if (error instanceof EmailTemplateDeleteError) throw error;
    if ((error as { code?: string })?.code === "23503") {
      throw new EmailTemplateDeleteError("This email is still referenced by saved records and cannot be deleted.", 409);
    }
    throw error;
  }
}

/** Re-creates a deleted system email from SYSTEM_EMAIL_DEFS's starter
 * content. The admin edits it afterward like anything else; this just
 * gets a valid row back under the exact key the call site looks up. */
export async function createSystemEmailTemplate(key: string): Promise<EmailTemplate> {
  const def = SYSTEM_EMAIL_DEFS.find((d) => d.key === key);
  if (!def) throw new EmailTemplateCreateError("Not a recognized system email key.", 400);
  const existing = await pool.query("SELECT 1 FROM email_templates WHERE key = $1", [key]);
  if (existing.rowCount) throw new EmailTemplateCreateError("This email already exists.", 409);
  const result = await pool.query<EmailTemplate>(
    `INSERT INTO email_templates (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars)
     VALUES ($1, 'system', $2, $3, $4, $5, 'info@example.com', false, true, $6)
     RETURNING key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars, blocks_json`,
    [def.key, def.label, def.description, def.defaultSubject, def.defaultBody, def.allowedVars]
  );
  return result.rows[0];
}

/** Shared by the console's own editor and /api/v1/email: edits an
 * existing template's content. Every row (account/security included) is
 * fully deletable -- see deleteEmailTemplate / createSystemEmailTemplate
 * above for how a deleted system email comes back. */
export async function updateEmailTemplate(
  key: string,
  input: {
    subject: string;
    bodyHtml: string;
    fromEmail?: string | null;
    trackOpens?: boolean | null;
    /** Present only when saved from the visual builder -- omit entirely
     * (not an empty array) for a plain-editor save, same convention as
     * emailContentTemplates.ts's resolveBody. */
    blocks?: unknown;
  }
): Promise<void> {
  const { subject: rawSubject, fromEmail, trackOpens } = input;
  const subject = rawSubject;
  const { blocks, bodyHtml } = resolveEmailBodySave(input);
  if (!subject.trim() || !bodyHtml.trim()) {
    throw new EmailTemplateUpdateError("subject and bodyHtml are required.");
  }
  // The username (local part) is entirely the admin's choice -- no fixed
  // list of addresses to pick from. Only checked for being a well-formed
  // email address; whether it actually delivers depends on the sending
  // domain (see emailSettings.ts) being verified with the mail provider,
  // which this function has no way to check.
  if (fromEmail !== undefined && fromEmail !== null && fromEmail !== "" && !EMAIL_RE.test(fromEmail)) {
    throw new EmailTemplateUpdateError("That doesn't look like an email address.");
  }
  const template = await pool.query("SELECT allowed_vars FROM email_templates WHERE key = $1", [key]);
  if (!template.rows[0]) throw new EmailTemplateUpdateError("Template not found.", 404);
  const usedVars = [...`${subject} ${bodyHtml}`.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]);
  // site_name is always available -- it's substituted automatically by
  // getEmailTemplate before any template is sent, not something each
  // template's own allowed_vars list needs to opt into.
  const allowedVars = new Set([...(template.rows[0].allowed_vars || []), "site_name"]);
  const invalidVars = usedVars.filter((name) => !allowedVars.has(name));
  if (invalidVars.length > 0) {
    throw new EmailTemplateUpdateError(`Unsupported placeholder: {{${invalidVars[0]}}}`);
  }

  const blocksParam = blocks ? JSON.stringify(blocks) : null;
  const result = await pool.query(
    `UPDATE email_templates
     SET subject = $1, body_html = $2, from_email = COALESCE($3, from_email), track_opens = COALESCE($4, track_opens),
         blocks_json = CASE WHEN $7::boolean THEN $6::jsonb ELSE blocks_json END, updated_at = now()
     WHERE key = $5
     RETURNING key`,
    [subject, bodyHtml, fromEmail || null, typeof trackOpens === "boolean" ? trackOpens : null, key, blocksParam, input.blocks !== undefined]
  );
  if (result.rowCount === 0) throw new EmailTemplateUpdateError("Template not found.", 404);
}
