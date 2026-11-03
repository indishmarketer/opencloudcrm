import { pool } from "@/lib/db";
import { normalizeContactEmail, recordContactActivity } from "@/lib/contacts";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/email";
import { firstNameOf } from "@/lib/emailAutomation";
import { escapeHtml } from "@/lib/escapeHtml";
import { raiseInboxAlert } from "@/lib/systemAlerts";

const SOURCE = "open-cloud-crm";

/** Sends the Open Cloud CRM welcome email the first time (and only the
 * first time) a given email address comes in through the inbound webhook
 * with that source slug. Keyed on the normalized email rather than the raw
 * webhook event id, so a retried or duplicate webhook delivery for the same
 * person never sends a second welcome email. Never throws -- a failure here
 * must not take down the webhook response. */
export async function sendOpenCloudCrmWelcomeEmailOnce(email: string, name: string | null): Promise<void> {
  const normalizedEmail = normalizeContactEmail(email);
  try {
    const existing = await pool.query(
      `SELECT 1 FROM contact_activities
       WHERE source = $1 AND activity_type = 'open_cloud_crm_welcome_sent' AND source_record_id = $2
       LIMIT 1`,
      [SOURCE, normalizedEmail],
    );
    if (existing.rowCount) return;

    const tpl = await getEmailTemplate("open-cloud-crm-welcome");
    const vars = { first_name: escapeHtml(firstNameOf(name)) };
    await sendEmail({
      to: normalizedEmail,
      subject: applyTemplateVars(tpl.subject, vars),
      html: applyTemplateVars(tpl.body_html, vars),
      from: tpl.from_email,
      critical: tpl.critical,
      templateKey: tpl.key,
      category: "fixed",
      trackOpens: tpl.track_opens,
    });

    await recordContactActivity({
      email: normalizedEmail,
      activityType: "open_cloud_crm_welcome_sent",
      source: SOURCE,
      sourceRecordId: normalizedEmail,
      metadata: {},
    });

    raiseInboxAlert({
      kind: "open_cloud_crm_lead",
      dedupeKey: `open_cloud_crm_signup:${normalizedEmail}`,
      title: `Open Cloud CRM lead: ${name || normalizedEmail}`,
      detail: `${name || "Someone"} (${normalizedEmail}) signed up on the Open Cloud CRM landing page.`,
      link: "/console/contacts?source=has_webhook_lead",
    }).catch(() => {});
  } catch (err) {
    console.error("Open Cloud CRM welcome email failed (non-fatal):", err);
  }
}
