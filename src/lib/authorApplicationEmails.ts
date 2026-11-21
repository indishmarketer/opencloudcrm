import { SITE_NAME } from "@/config/brand";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escapeHtml";
import { applyTemplateVars, getEmailTemplateOptional } from "@/lib/emailTemplates";
import { SITE_URL } from "@/lib/liveSiteUrl";

type EmailKind = "received" | "approved" | "rejected" | "changes_requested" | "accepted";

type ApplicationEmail = {
  name: string | null;
  email: string;
  accessToken: string | null;
  note?: string | null;
};

const TEMPLATE_KEYS: Record<EmailKind, string> = {
  received: "author-application-received",
  approved: "author-application-approved",
  rejected: "author-application-rejected",
  changes_requested: "author-application-changes-requested",
  accepted: "author-application-draft-accepted",
};

function fallback(kind: EmailKind, firstName: string, url: string, note: string) {
  const link = `<p style="margin:24px 0"><a href="${escapeHtml(url)}">Open your private application page</a></p>`;
  if (kind === "received") return {
    subject: `We received your ${SITE_NAME} writer application`,
    html: `<p>Hi ${firstName},</p><p>Thank you for applying to write with ${SITE_NAME}. We have received your topic, writing sample, and contact details.</p><p>A person will review the clarity of your writing, your experience with the subject, and whether the idea is useful for our readers. We will email you after the review. If the application is approved, the private page below will let you send a full draft without creating an account.</p>${link}`,
  };
  if (kind === "approved") return {
    subject: `You are approved to write for ${SITE_NAME}`,
    html: `<p>Hi ${firstName},</p><p>We enjoyed your idea and writing sample, and we would like to read a full draft from you.</p><p>Please keep the article practical, original, and based on experience you can explain clearly. You can upload a PDF or Word document, or share a public Google Docs, Notion, Medium, Substack, or website link through your private application page.</p><p>Approval means we want to review the full article. We may still suggest edits before publication.</p>${link}`,
  };
  if (kind === "rejected") return {
    subject: `An update on your ${SITE_NAME} writer application`,
    html: `<p>Hi ${firstName},</p><p>Thank you for taking the time to share your idea and sample with us. After reviewing it, we have decided that it is not the right fit for the publication at the moment.</p><p>This decision only applies to this application. You are welcome to return later with a different topic, a more specific angle, or another piece that better reflects your experience.</p>${link}`,
  };
  if (kind === "changes_requested") return {
    subject: "A few changes are needed on your draft",
    html: `<p>Hi ${firstName},</p><p>Thank you for sending your draft. We have read it and would like you to revise a few things before we review it again.</p><div style="margin:20px 0;padding:16px;border-left:3px solid #6d28d9;background:#f7f5ff"><strong>Requested changes</strong><br>${note}</div><p>When the revision is ready, upload the new document or replace the draft link on your private application page.</p>${link}`,
  };
  return {
    subject: "Your draft has been accepted",
    html: `<p>Hi ${firstName},</p><p>Good news. Your draft has been accepted for the next stage of our editorial process.</p><p>Please open your private application page and add the website and social links you want us to use with your author byline. We will contact you if we need anything else while preparing the article for publication.</p>${link}`,
  };
}

function standardReplyAndSignoff(url: string): string {
  return `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e7e2f7">
    <p><strong>Need to send something different?</strong></p>
    <p>If you changed your article, want to replace a sample, or would like to share another piece, simply reply to this email. Attach the document or include a public Google Drive, Google Docs, Notion, Medium, Substack, or website link.</p>
    <p>You can also return to your <a href="${escapeHtml(url)}">private application page</a> at any time.</p>
    <p style="margin-top:24px">Thanks and regards,<br><strong>The ${SITE_NAME} team</strong></p>
  </div>`;
}

export async function sendAuthorApplicationEmail(kind: EmailKind, application: ApplicationEmail) {
  const name = (application.name || "there").trim();
  const firstName = escapeHtml(name.split(/\s+/)[0] || "there");
  const url = application.accessToken
    ? `${SITE_URL}/apply-to-write?token=${encodeURIComponent(application.accessToken)}`
    : `${SITE_URL}/apply-to-write`;
  const note = escapeHtml(application.note || "").replace(/\n/g, "<br>");
  const vars = { name: escapeHtml(name), first_name: firstName, submit_url: url, note };
  const template = await getEmailTemplateOptional(TEMPLATE_KEYS[kind]);
  const content = template
    ? { subject: applyTemplateVars(template.subject, vars), html: applyTemplateVars(template.body_html, vars) }
    : fallback(kind, firstName, url, note);
  const html = `${content.html}${standardReplyAndSignoff(url)}`;

  return sendEmail({
    to: application.email,
    subject: content.subject,
    html,
    from: template?.from_email,
    templateKey: template?.key,
    category: template ? "fixed" : "system",
    trackOpens: template?.track_opens ?? true,
    trackClicks: false,
    purpose: "transactional",
  });
}
