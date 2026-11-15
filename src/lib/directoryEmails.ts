import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getBusiness } from "@/lib/businessProfile";
import { SITE_NAME } from "@/config/brand";
import { escapeHtml } from "@/lib/escapeHtml";

/** Every email the tools directory sends, built in. These are not
 * automations: they go out from the review flow itself, so every
 * OpenCloudCRM install has working tool emails with zero setup. What an
 * install can change is only the wording -- subject and body -- from
 * Tools directory → Communication. An edit is stored as an override row
 * in email_templates; deleting that row (Reset) falls back to the default
 * here, so an email can never go missing. They send from the install's
 * own "Tools directory" username and sending domain (Email → Sending),
 * and {{site_name}} is the install's own business name. */
export const DIRECTORY_EMAILS = [
  {
    key: "tool-submission-received",
    label: "Submission received",
    when: "Right after someone submits a tool.",
    vars: ["first_name", "tool_name", "website_url", "edit_url", "site_name"],
    subject: "We received {{tool_name}}",
    body: `<p>Hi {{first_name}},</p><p>Thank you for submitting your tool to the {{site_name}} tools directory. We have received the listing for <strong>{{tool_name}}</strong> ({{website_url}}).</p><p>We will review it and email you when the review is complete. If anything needs to change, we will tell you what to update.</p><p><a href="{{edit_url}}">View your submission</a></p><p>Thanks,<br>The {{site_name}} team</p>`,
  },
  {
    key: "tool-submission-approved",
    label: "Tool published",
    when: "When the tool goes live: you approve it, or a paid listing you already approved is paid for.",
    vars: ["first_name", "tool_name", "tool_url", "manage_url", "site_name"],
    subject: "{{tool_name}} is now live on {{site_name}}",
    body: `<p>Hi {{first_name}},</p><p>Good news. We approved <strong>{{tool_name}}</strong> and it is now live in the {{site_name}} tools directory.</p><p><a href="{{tool_url}}">See your listing</a></p><p>Want to change something later? Open <a href="{{manage_url}}">My tools</a> and send us an edit request.</p><p>Thanks,<br>The {{site_name}} team</p>`,
  },
  {
    key: "tool-submission-approved-payment",
    label: "Approved, payment needed",
    when: "When you approve a paid listing that hasn't been paid for yet.",
    vars: ["first_name", "tool_name", "payment_url", "site_name"],
    subject: "{{tool_name}} is approved. One step left",
    body: `<p>Hi {{first_name}},</p><p>We approved <strong>{{tool_name}}</strong> for the {{site_name}} tools directory. It goes live as soon as the listing fee is paid.</p><p><a href="{{payment_url}}">Complete payment</a></p><p>Thanks,<br>The {{site_name}} team</p>`,
  },
  {
    key: "tool-payment-received",
    label: "Payment received",
    when: "When a paid listing pays before you have reviewed it.",
    vars: ["first_name", "tool_name", "manage_url", "site_name"],
    subject: "Payment received for {{tool_name}}",
    body: `<p>Hi {{first_name}},</p><p>We received your payment for <strong>{{tool_name}}</strong>. Your listing is in our review queue, and we will email you as soon as it is live.</p><p><a href="{{manage_url}}">View my tools</a></p><p>Thanks,<br>The {{site_name}} team</p>`,
  },
  {
    key: "tool-submission-changes-requested",
    label: "Changes requested",
    when: "When you click Request changes. {{note}} is what you wrote.",
    vars: ["first_name", "tool_name", "note", "edit_url", "site_name"],
    subject: "A few changes needed for {{tool_name}}",
    body: `<p>Hi {{first_name}},</p><p>Thanks for submitting <strong>{{tool_name}}</strong>. Before we publish it, please make these changes:</p><p>{{note}}</p><p><a href="{{edit_url}}">Update your submission</a></p><p>Once you send it back, we will review it again.</p><p>Thanks,<br>The {{site_name}} team</p>`,
  },
  {
    key: "tool-submission-rejected",
    label: "Submission declined",
    when: "When you decline a tool. {{note}} is your reason, if you wrote one.",
    vars: ["first_name", "tool_name", "note", "site_name"],
    subject: "About your {{tool_name}} submission",
    body: `<p>Hi {{first_name}},</p><p>Thanks for submitting <strong>{{tool_name}}</strong>. We reviewed it and won't be adding it to the directory right now.</p><p>{{note}}</p><p>Thanks,<br>The {{site_name}} team</p>`,
  },
  {
    key: "tool-edit-approved",
    label: "Edit request approved",
    when: "When you approve an edit to a live listing.",
    vars: ["first_name", "tool_name", "tool_url", "site_name"],
    subject: "Your changes to {{tool_name}} are live",
    body: `<p>Hi {{first_name}},</p><p>We approved your edit request. The changes to <strong>{{tool_name}}</strong> are now live.</p><p><a href="{{tool_url}}">See your listing</a></p><p>Thanks,<br>The {{site_name}} team</p>`,
  },
  {
    key: "tool-edit-rejected",
    label: "Edit request declined",
    when: "When you decline an edit to a live listing.",
    vars: ["first_name", "tool_name", "note", "manage_url", "site_name"],
    subject: "About your edit to {{tool_name}}",
    body: `<p>Hi {{first_name}},</p><p>We reviewed your edit request for <strong>{{tool_name}}</strong> and kept the listing as it is.</p><p>{{note}}</p><p>You can send a new request any time from <a href="{{manage_url}}">My tools</a>.</p><p>Thanks,<br>The {{site_name}} team</p>`,
  },
  {
    key: "tool-submission-admin-notify",
    label: "Needs review (to you)",
    when: "To the site owner (ADMIN_EMAIL) when a tool is submitted, resubmitted, or an edit is requested.",
    vars: ["submitter_email", "event_text", "tool_name", "console_url", "site_name"],
    subject: "Tools directory: {{tool_name}} needs review",
    body: `<p>{{submitter_email}} {{event_text}} <strong>{{tool_name}}</strong>.</p><p><a href="{{console_url}}">Review it in the console</a></p>`,
  },
] as const;

export type DirectoryEmailKey = (typeof DIRECTORY_EMAILS)[number]["key"];

export function directoryEmailDefault(key: string) {
  return DIRECTORY_EMAILS.find((email) => email.key === key) || null;
}

/** The wording in use: the install's saved edit, or the built-in default. */
export async function getDirectoryEmailContent(key: DirectoryEmailKey): Promise<{ subject: string; body: string; edited: boolean }> {
  const fallback = directoryEmailDefault(key)!;
  const row = await pool.query<{ subject: string; body_html: string }>("SELECT subject, body_html FROM email_templates WHERE key = $1", [key]).catch(() => ({ rows: [] }));
  const saved = row.rows[0];
  return saved && saved.subject.trim() && saved.body_html.trim()
    ? { subject: saved.subject, body: saved.body_html, edited: true }
    : { subject: fallback.subject, body: fallback.body, edited: false };
}

/** Sends one directory email. `vars` are plain text; they are escaped for
 * the body here. `note` keeps its line breaks. */
export async function sendDirectoryEmail(key: DirectoryEmailKey, to: string, vars: Record<string, string | null | undefined>, options: { replyTo?: string } = {}) {
  const content = await getDirectoryEmailContent(key);
  const business = await getBusiness().catch(() => null);
  const values: Record<string, string> = { site_name: business?.brand || SITE_NAME };
  for (const [name, value] of Object.entries(vars)) values[name] = String(value ?? "");
  const subject = content.subject.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => (values[name] ?? "").replace(/[\r\n]+/g, " "));
  const html = content.body.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => {
    const value = values[name] ?? "";
    return name === "note" ? escapeHtml(value.trim()).replace(/\n/g, "<br>") : escapeHtml(value);
  });
  return sendEmail({ to, subject, html, templateKey: key, category: "fixed", purpose: "directory", ...(options.replyTo ? { replyTo: options.replyTo } : {}) });
}

/** Saves an edit as the override row; resetting deletes it. */
export async function saveDirectoryEmail(key: DirectoryEmailKey, subject: string, body: string) {
  const fallback = directoryEmailDefault(key)!;
  await pool.query(
    `INSERT INTO email_templates (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars)
     VALUES ($1, 'tool-directory', $2, $3, $4, $5, 'support@example.com', false, true, $6)
     ON CONFLICT (key) DO UPDATE SET subject = EXCLUDED.subject, body_html = EXCLUDED.body_html, blocks_json = NULL`,
    [key, `Tools directory: ${fallback.label}`, fallback.when, subject, body, [...fallback.vars]],
  );
}

export async function resetDirectoryEmail(key: DirectoryEmailKey) {
  await pool.query("DELETE FROM email_templates WHERE key = $1", [key]);
}
