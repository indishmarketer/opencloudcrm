import crypto from "node:crypto";
import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getEmailTemplate, applyTemplateVars } from "@/lib/emailTemplates";
import { escapeHtml } from "@/lib/escapeHtml";
import { getGoogleReviewUrl } from "@/lib/googleReview";
import { createNotification } from "@/lib/notifications";
import { sendTransactionalWhatsApp } from "@/lib/whatsappTransactional";

/** A review request can go out over email (the fixed email templates) or
 * WhatsApp (the fixed "customer_review_request" template). */
export type ReviewRequestChannel = "email" | "whatsapp";

export async function queueGoogleReviewRequest(input: {
  contactId: number;
  templateKey?: string;
  channel?: ReviewRequestChannel;
  whatsappTemplateKey?: string;
  scheduledFor?: Date;
  requestedByEmail?: string;
  automationFlowId?: number;
  automationRunId?: number;
  automationStepId?: number;
  automationWorkflowId?: number;
  automationWorkflowRunId?: number;
  automationWorkflowNodeId?: string;
}) {
  const channel = input.channel || "email";
  const reviewUrl = await getGoogleReviewUrl();
  if (!reviewUrl) throw new Error("Add the official Google 'Ask for reviews' link before sending requests");
  const contact = await pool.query(
    `SELECT id, email, name, phone, marketing_status, deliverability_status, whatsapp_status FROM contacts WHERE id = $1`, [input.contactId]);
  const row = contact.rows[0];
  if (!row) throw new Error("Contact was not found");

  if (channel === "whatsapp") {
    if (!row.phone) throw new Error("This contact has no phone number, so a WhatsApp review request cannot be sent.");
    if (row.whatsapp_status === "unsubscribed") throw new Error("This contact has opted out of WhatsApp.");
    const whatsappTemplateKey = input.whatsappTemplateKey || "customer_review_request";
    const duplicate = await pool.query(
      `SELECT id FROM review_requests WHERE contact_id=$1 AND channel='whatsapp'
         AND status IN ('queued','sending','sent') AND created_at > now()-interval '90 days' LIMIT 1`,
      [row.id]);
    if (duplicate.rowCount) throw new Error("A WhatsApp review request was already queued or sent to this contact in the last 90 days");
    const inserted = await pool.query(
      `INSERT INTO review_requests (tracking_id,contact_id,channel,whatsapp_template_key,scheduled_for,
        requested_by_email,automation_flow_id,automation_run_id,automation_step_id,
        automation_workflow_id,automation_workflow_run_id,automation_workflow_node_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [crypto.randomUUID(), row.id, "whatsapp", whatsappTemplateKey,
       input.scheduledFor || new Date(), input.requestedByEmail || null, input.automationFlowId || null,
       input.automationRunId || null, input.automationStepId || null, input.automationWorkflowId || null,
       input.automationWorkflowRunId || null, input.automationWorkflowNodeId || null]);
    return Number(inserted.rows[0].id);
  }

  if (row.marketing_status !== "subscribed" || row.deliverability_status !== "ok") {
    throw new Error("This contact is not subscribed or is not deliverable");
  }
  const suppressed = await pool.query("SELECT 1 FROM email_suppressions WHERE lower(trim(email))=lower(trim($1))", [row.email]);
  if (suppressed.rowCount) throw new Error("This contact has unsubscribed or is suppressed");
  const templateKey = input.templateKey || "google-review-request";
  const duplicate = await pool.query(
    `SELECT id,template_key,clicked_at FROM review_requests WHERE contact_id=$1 AND channel='email'
       AND status IN ('queued','sending','sent') AND created_at > now()-interval '90 days' ORDER BY created_at DESC`,
    [row.id]);
  if (templateKey === "google-review-reminder") {
    if (!duplicate.rows.some((r) => r.template_key === "google-review-request" && !r.clicked_at) || duplicate.rows.some((r) => r.template_key === "google-review-reminder")) {
      throw new Error("A reminder requires one unclicked original request and can only be sent once");
    }
  } else if (duplicate.rowCount) throw new Error("A review request was already queued or sent to this contact in the last 90 days");
  const inserted = await pool.query(
    `INSERT INTO review_requests (tracking_id,contact_id,channel,template_key,scheduled_for,
      requested_by_email,automation_flow_id,automation_run_id,automation_step_id,
      automation_workflow_id,automation_workflow_run_id,automation_workflow_node_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [crypto.randomUUID(), row.id, "email", templateKey,
     input.scheduledFor || new Date(), input.requestedByEmail || null, input.automationFlowId || null,
     input.automationRunId || null, input.automationStepId || null, input.automationWorkflowId || null,
     input.automationWorkflowRunId || null, input.automationWorkflowNodeId || null]);
  return Number(inserted.rows[0].id);
}

export async function dispatchDueReviewRequests(limit = 25) {
  const claimed = await pool.query(
    `UPDATE review_requests r SET status='sending',attempts=attempts+1,updated_at=now()
     WHERE r.id IN (
       SELECT id FROM review_requests
       WHERE (status='queued' AND scheduled_for<=now())
          OR (status='sending' AND updated_at<now()-interval '15 minutes')
       ORDER BY scheduled_for LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     RETURNING id`, [limit]);
  let sent = 0;
  let failed = 0;
  for (const item of claimed.rows) {
    try {
      const result = await pool.query(
        `SELECT r.*,c.email,c.name,c.phone,c.user_id,c.marketing_status,c.deliverability_status,c.whatsapp_status
         FROM review_requests r JOIN contacts c ON c.id=r.contact_id WHERE r.id=$1 AND r.status='sending'`, [item.id]);
      const row = result.rows[0];
      if (!row) continue;
      if (row.channel === "whatsapp") {
        await sendWhatsAppReviewRequest(row);
        await pool.query(`UPDATE review_requests SET status='sent',sent_at=now(),updated_at=now() WHERE id=$1`, [row.id]);
        sent++;
        if (row.user_id) {
          try {
            await createNotification(Number(row.user_id), "review_requested", {
              title: "Share an honest Google review",
              body: "We'd love to hear about your experience. Check your WhatsApp for the link.",
              link: await getGoogleReviewUrl() || undefined,
            });
          } catch (error) {
            console.error("Review request notification failed after send:", error);
          }
        }
        continue;
      }
      if (row.marketing_status !== "subscribed" || row.deliverability_status !== "ok") throw new Error("No current marketing consent or address is not deliverable");
      const reviewUrl = await getGoogleReviewUrl();
      if (!reviewUrl) throw new Error("Official Google review link is missing");
      const template = await getEmailTemplate(row.template_key);
      const firstName = String(row.name || "there").trim().split(/\s+/)[0] || "there";
      const vars = { first_name: escapeHtml(firstName), google_review_url: escapeHtml(reviewUrl) };
      const mail = await sendEmail({
        to: row.email,
        subject: applyTemplateVars(template.subject, vars),
        html: applyTemplateVars(template.body_html, vars),
        from: template.from_email,
        templateKey: template.key,
        category: "review_request",
        trackOpens: template.track_opens,
        flowStepId: row.automation_step_id || undefined,
        flowRunId: row.automation_run_id || undefined,
        workflowRunId: row.automation_workflow_run_id || undefined,
        workflowNodeId: row.automation_workflow_node_id || undefined,
      });
      if (!mail.ok) throw new Error("Email provider rejected the review request");
      const status = mail.skipped ? "suppressed" : "sent";
      await pool.query(`UPDATE review_requests SET status=$2,email_delivery_id=$3,sent_at=CASE WHEN $2='sent' THEN now() END,updated_at=now() WHERE id=$1`, [row.id, status, mail.deliveryId]);
      if (status === "sent") {
        sent++;
        if (row.user_id) {
          try {
            await createNotification(Number(row.user_id), "review_requested", {
              title: "Share an honest Google review",
              body: "We'd love to hear about your experience. Check your email for the link.",
              link: reviewUrl,
            });
          } catch (error) {
            console.error("Review request notification failed after send:", error);
          }
        }
      }
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown send failure";
      await pool.query(
        `UPDATE review_requests
         SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'queued' END,
             last_error = $2, updated_at = now()
         WHERE id = $1`,
        [item.id, message]
      );
    }
  }
  return { checked: claimed.rowCount || 0, sent, failed };
}

async function sendWhatsAppReviewRequest(row: {
  id: number;
  contact_id: string | number;
  email: string;
  name: string | null;
  phone: string | null;
  whatsapp_template_key: string | null;
}): Promise<void> {
  const reviewUrl = await getGoogleReviewUrl();
  if (!reviewUrl) throw new Error("Official Google review link is missing");
  if (!row.phone) throw new Error("No phone number on file");
  const firstName = String(row.name || "there").trim().split(/\s+/)[0] || "there";
  await sendTransactionalWhatsApp({
    phone: row.phone,
    templateName: row.whatsapp_template_key || "customer_review_request",
    languageCode: "en",
    contactId: Number(row.contact_id) || null,
    variableValues: { "review.google_review_url": reviewUrl },
    description: `Google review request for ${row.email}`,
    dedupeKey: `whatsapp_send_failed:review:${row.id}`,
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: firstName },
          { type: "text", text: reviewUrl },
        ],
      },
    ],
  });
}
