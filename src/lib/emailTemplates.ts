import { pool } from "@/lib/db";
import { SITE_HOSTNAME } from "@/lib/liveSiteUrl";
import { resolveEmailDomain } from "@/lib/emailSettings";
import { getBusiness } from "@/lib/businessProfile";
import { SITE_NAME } from "@/config/brand";
import { escapeHtml } from "@/lib/escapeHtml";

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

// These keys are read by application workflows. Removing their rows would
// make the corresponding signup, payment, booking, or support flow fail.
// The pattern checks cover keys selected from persisted meeting/webinar and
// directory records, where the call-site receives the key dynamically.
const CODE_LINKED_TEMPLATE_KEYS = new Set([
  "email-verification", "password-reset", "magic-link-login", "otp-code", "account-email-change",
  "console-admin-invite", "author-application-received", "author-application-approved",
  "author-application-rejected", "author-application-changes-requested", "author-application-draft-accepted",
  "contact-form-admin-notify", "contact-form-received", "contact-form-reply", "review-submission-received",
  "review-question-to-author", "payment-claim-admin-notify", "payment-claim-received",
  "razorpay-unmatched-payment-alert", "payment-grant-failed-alert", "course-access-granted-pro",
  "course-access-granted-free", "course-access-granted-manual", "course-access-granted-new-account",
  "course-access-granted-claim-approved", "course-access-upgraded", "tool-submission-admin-notify",
  "tool-submission-approved", "tool-submission-approved-payment", "tool-submission-changes-requested",
  "tool-submission-rejected", "open-cloud-crm-welcome", "webinar-guest-signin", "google-review-request",
  "google-review-reminder", "review-submission-received", "review-submitted-admin-notify",
  "meeting-confirmation", "meeting-unrecognized-type-alert", "meeting-reconciliation-orphan-alert",
  "meeting-owner-new-booking", "meeting-cancelled", "meeting-owner-cancelled-notice",
  "meeting-owner-rescheduled-notice", "webinar-registration-confirmation", "webinar-reminder",
]);

function isCodeLinkedTemplate(key: string): boolean {
  return CODE_LINKED_TEMPLATE_KEYS.has(key) || /^(meeting|webinar|tool-submission|author-application|course-access|payment-|contact-form|review-|console-admin-)/.test(key);
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

/** Shared by the console's own editor and /api/v1/email: these are fixed,
 * code-referenced templates (each key is sent by a specific trigger
 * elsewhere in the app -- see getEmailTemplate's comment), so only editing
 * is exposed. There's no create or delete: a new key would never be sent by
 * anything, and deleting an existing one would break whatever transactional
 * email still calls getEmailTemplate(key) for it. */
export async function updateEmailTemplate(
  key: string,
  input: { subject: string; bodyHtml: string; fromEmail?: string | null; trackOpens?: boolean | null }
): Promise<void> {
  const { subject, bodyHtml, fromEmail, trackOpens } = input;
  if (!subject.trim() || !bodyHtml.trim()) {
    throw new EmailTemplateUpdateError("subject and bodyHtml are required.");
  }
  // info@ (this site's receive-only inbox) is never selectable as a sending
  // identity here -- me@ is the owner-notification alias instead. The
  // domain is the console-configured sending domain when one is set (see
  // emailSettings.ts), else this deployment's own site domain.
  const domain = await resolveEmailDomain(SITE_HOSTNAME);
  const emailAt = (local: string) => `${local}@${domain}`;
  const allowedSenders = new Set([emailAt("me"), emailAt("support"), emailAt("reach"), emailAt("academy")]);
  if (fromEmail !== undefined && fromEmail !== null && !allowedSenders.has(fromEmail)) {
    throw new EmailTemplateUpdateError("Choose a verified sending address.");
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
