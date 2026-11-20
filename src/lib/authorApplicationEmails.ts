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
  const link = `<p><a href="${escapeHtml(url)}">Open your private application page</a></p>`;
  if (kind === "received") return {
    subject: `We received your ${SITE_NAME} writer application`,
    html: `<p>Hi ${firstName},</p><p>Thanks for applying to write with us. A person will read your sample and pitch. We will email you after the review.</p>${link}`,
  };
  if (kind === "approved") return {
    subject: `You are approved to write for ${SITE_NAME}`,
    html: `<p>Hi ${firstName},</p><p>We would like to read a full draft from you. You can upload a document or share a Google Docs, Notion, Medium, Substack, or website link on your private application page.</p>${link}`,
  };
  if (kind === "rejected") return {
    subject: `An update on your ${SITE_NAME} writer application`,
    html: `<p>Hi ${firstName},</p><p>Thanks for taking the time to apply. Your application is not the right fit for us at the moment.</p>${link}`,
  };
  if (kind === "changes_requested") return {
    subject: "A few changes are needed on your draft",
    html: `<p>Hi ${firstName},</p><p>We read your draft and would like you to revise a few things:</p><p>${note}</p>${link}`,
  };
  return {
    subject: "Your draft has been accepted",
    html: `<p>Hi ${firstName},</p><p>Your draft is accepted. Please add the website and social links you want us to use with your author byline.</p>${link}`,
  };
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

  return sendEmail({
    to: application.email,
    subject: content.subject,
    html: content.html,
    from: template?.from_email,
    templateKey: template?.key,
    category: template ? "fixed" : "system",
    trackOpens: template?.track_opens ?? true,
    trackClicks: false,
    purpose: "transactional",
  });
}
