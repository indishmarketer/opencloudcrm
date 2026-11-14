import { pool } from "@/lib/db";
import { getBusiness } from "@/lib/businessProfile";
import { SITE_NAME } from "@/config/brand";
import { escapeHtml } from "@/lib/escapeHtml";

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

/** Loads one email_templates row. Every fixed-email call site MUST have a
 * seeded row (see migration 032) -- if a key is missing, this throws rather
 * than silently sending broken/placeholder copy, since that would mean the
 * owner's edited content (or lack of it) was silently bypassed. */
export async function getEmailTemplate(key: string): Promise<EmailTemplate> {
  const result = await pool.query<EmailTemplate>(
    `SELECT key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars
     FROM email_templates WHERE key = $1`,
    [key]
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Missing email_templates row for key "${key}". Run migration 032.`);
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

/** Like getEmailTemplate, but for keys the self-hoster is allowed to delete
 * (anything not in CODE_LINKED_TEMPLATE_KEYS / the critical set). Returns
 * null instead of throwing when the row is gone, so the surrounding
 * business logic (granting a course, recording a payment, etc.) still
 * completes -- only the now-optional notification email is skipped. The
 * underlying event this call site emits (webhookEvents) still fires either
 * way, so a self-hoster can wire their own automation back up from the
 * console. */
export async function getEmailTemplateOptional(key: string): Promise<EmailTemplate | null> {
  const result = await pool.query<EmailTemplate>(
    `SELECT key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars
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
    `SELECT key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars
     FROM email_templates ORDER BY category, label`
  );
  return result.rows;
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

// Everything the application itself cannot run without: the account and
// security primitives (signup/login/password/email-change), plus the
// handful of templates that are themselves the delivery envelope for
// admin-typed content or a one-time credential rather than an automation
// notification (see the comment at each call site for why). Every other
// fixed email in the app degrades gracefully (getEmailTemplateOptional)
// when its row is deleted, so this set stays short on purpose.
const CODE_LINKED_TEMPLATE_KEYS = new Set([
  "email-verification", "password-reset", "magic-link-login", "otp-code", "account-email-change",
  "console-admin-invite", "contact-form-reply", "review-question-to-author", "webinar-guest-signin",
]);

function isCodeLinkedTemplate(key: string): boolean {
  return CODE_LINKED_TEMPLATE_KEYS.has(key);
}

export function canDeleteEmailTemplate(template: Pick<EmailTemplate, "key" | "critical">): boolean {
  return !template.critical && !isCodeLinkedTemplate(template.key);
}

export async function deleteEmailTemplate(key: string): Promise<void> {
  const result = await pool.query<{ critical: boolean }>(
    "SELECT critical FROM email_templates WHERE key = $1", [key]
  );
  if (!result.rows[0]) throw new EmailTemplateDeleteError("Template not found.", 404);
  if (!canDeleteEmailTemplate({ key, critical: result.rows[0].critical })) {
    throw new EmailTemplateDeleteError("This email is required by an active site feature and cannot be deleted.", 409);
  }
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

/** Shared by the console's own editor and /api/v1/email: edits an
 * existing fixed template's content. There's no create here -- a brand
 * new key would never be sent by anything, since every key is read by one
 * specific call site elsewhere in the app. Deletion is a separate function
 * (deleteEmailTemplate, above) gated by canDeleteEmailTemplate -- most keys
 * may be deleted; the ones that may not are account/security primitives or
 * the delivery envelope for admin-typed content, not exposed here. */
export async function updateEmailTemplate(
  key: string,
  input: { subject: string; bodyHtml: string; fromEmail?: string | null; trackOpens?: boolean | null }
): Promise<void> {
  const { subject, bodyHtml, fromEmail, trackOpens } = input;
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

  const result = await pool.query(
    `UPDATE email_templates
     SET subject = $1, body_html = $2, from_email = COALESCE($3, from_email), track_opens = COALESCE($4, track_opens), updated_at = now()
     WHERE key = $5
     RETURNING key`,
    [subject, bodyHtml, fromEmail || null, typeof trackOpens === "boolean" ? trackOpens : null, key]
  );
  if (result.rowCount === 0) throw new EmailTemplateUpdateError("Template not found.", 404);
}
