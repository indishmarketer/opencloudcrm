import crypto from "node:crypto";
import { pool, withTransaction } from "@/lib/db";
import { workflowGraphSchema, workflowReadinessIssues, type WorkflowGraph, type WorkflowNode } from "@/lib/workflowGraph";
import { sendEmailWithRetry } from "@/lib/emailOutbox";
import { sendEmail } from "@/lib/email";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { getContentTemplate } from "@/lib/emailContentTemplates";
import { sendWhatsAppTemplateMessage, normalizePhoneForWhatsApp } from "@/lib/whatsapp";
import { hasOptedOut, canSendWhatsAppMarketing } from "@/lib/whatsappContacts";
import { listWhatsAppTemplates } from "@/lib/whatsappTemplates";
import { deliverWebhookAttempt } from "@/lib/webhookDelivery";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhookEventCatalogue";
import { findOrCreateAccount, grantCourseManually } from "@/lib/courseGrant";
import { SITE_URL } from "@/config/brand";
import { sendMeetingConfirmation } from "@/lib/meetingEmails";
import { emailAt } from "@/config/brand";
import { buildSegmentPredicate } from "@/lib/contactSegments";
import { automationGoalReached } from "@/lib/emailAutomation";
import { queueGoogleReviewRequest } from "@/lib/reviewRequests";

export type WorkflowRecord = {
  id: number;
  name: string;
  description: string;
  status: "draft" | "active" | "paused";
  trigger_type: "event" | "webhook";
  trigger_key: string | null;
  webhook_token_hash: string | null;
  graph: WorkflowGraph;
  folder_id: number | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowTestRecipient = { email?: string; phone?: string };

const TOKEN_PREFIX = "wf_";
export function hashWorkflowToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function queueWorkflowRun(input: { workflowId: number; dedupeKey: string; payload: unknown }): Promise<number | null> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO automation_workflow_runs (workflow_id, dedupe_key, trigger_payload)
     SELECT id, $2, $3::jsonb FROM automation_workflows WHERE id = $1 AND status = 'active' AND archived_at IS NULL
     ON CONFLICT (workflow_id, dedupe_key) DO NOTHING RETURNING id`,
    [input.workflowId, input.dedupeKey, JSON.stringify(input.payload)],
  );
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
}

export async function queueInboundWorkflowRun(token: string, payload: unknown): Promise<{ workflowId: number; runId: number } | null> {
  const found = await pool.query<{ id: number }>(
    "SELECT id FROM automation_workflows WHERE webhook_token_hash = $1 AND status = 'active' AND trigger_type = 'webhook' AND archived_at IS NULL",
    [hashWorkflowToken(token)],
  );
  const workflowId = found.rows[0]?.id;
  if (!workflowId) return null;
  const dedupeKey = `webhook:${crypto.randomUUID()}`;
  const runId = await queueWorkflowRun({ workflowId, dedupeKey, payload: { event_type: "workflow.webhook", data: payload, occurred_at: new Date().toISOString() } });
  return runId ? { workflowId, runId } : null;
}

export async function rotateWorkflowWebhookToken(id: number): Promise<string | null> {
  const token = `${TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  const updated = await pool.query("UPDATE automation_workflows SET webhook_token_hash = $2, updated_at = now() WHERE id = $1 AND trigger_type = 'webhook' AND archived_at IS NULL RETURNING id", [id, hashWorkflowToken(token)]);
  return updated.rowCount ? token : null;
}

export function safeWorkflowRecord(row: WorkflowRecord) {
  const { webhook_token_hash: _tokenHash, ...safe } = row;
  return safe;
}

export async function listWorkflows(): Promise<WorkflowRecord[]> {
  const result = await pool.query<WorkflowRecord>(
    `SELECT id, name, description, status, trigger_type, trigger_key, webhook_token_hash, graph, folder_id, created_at, updated_at
     FROM automation_workflows WHERE archived_at IS NULL ORDER BY updated_at DESC, id DESC`,
  );
  return result.rows;
}

export async function getWorkflow(id: number): Promise<WorkflowRecord | null> {
  const result = await pool.query<WorkflowRecord>(
    `SELECT id, name, description, status, trigger_type, trigger_key, webhook_token_hash, graph, folder_id, created_at, updated_at
     FROM automation_workflows WHERE id = $1 AND archived_at IS NULL`, [id],
  );
  return result.rows[0] || null;
}

/** Preserve a legacy inbound integration until an active visual flow filters
 * for that exact slug and includes the corresponding channel action. */
export async function hasActiveInboundWebhookAction(slug: string, kind: "email" | "whatsapp") {
  const result = await pool.query<{ enabled: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM automation_workflows
       WHERE status = 'active' AND trigger_type = 'event' AND trigger_key = 'external_webhook.received'
         AND graph @> $1::jsonb AND graph @> $2::jsonb
     ) AS enabled`,
    [
      JSON.stringify({ nodes: [{ data: { kind: "condition", config: { field: "data.source_slug", operator: "equals", value: slug } } }] }),
      JSON.stringify({ nodes: [{ data: { kind } }] }),
    ],
  );
  return result.rows[0]?.enabled === true;
}

export async function hasActiveWorkflowActionForEvent(triggerKey: string, kind: "email" | "whatsapp") {
  const result = await pool.query<{ enabled: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM automation_workflows
       WHERE status = 'active' AND trigger_type = 'event' AND trigger_key = $1
         AND graph @> $2::jsonb
     ) AS enabled`,
    [triggerKey, JSON.stringify({ nodes: [{ data: { kind } }] })],
  );
  return result.rows[0]?.enabled === true;
}

export async function createWorkflow(input: {
  name?: string;
  description?: string;
  triggerType: "event" | "webhook";
  triggerKey?: string;
}): Promise<{ workflow: WorkflowRecord; webhookToken?: string }> {
  const name = (input.name || "Untitled workflow").trim().slice(0, 160) || "Untitled workflow";
  const triggerType = input.triggerType || "event";
  const triggerKey = input.triggerKey || WEBHOOK_EVENT_TYPES[0]?.key;
  if (triggerType === "event" && !WEBHOOK_EVENT_TYPES.some((event) => event.key === triggerKey)) {
    throw new Error("Choose a supported event trigger.");
  }
  const token = triggerType === "webhook" ? `${TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}` : null;
  const triggerLabel = triggerType === "webhook"
    ? "Incoming webhook"
    : WEBHOOK_EVENT_TYPES.find((event) => event.key === triggerKey)?.label || "Event trigger";
  const graph: WorkflowGraph = {
    nodes: [{ id: "trigger", type: "workflow", position: { x: 80, y: 180 }, data: { kind: "trigger", label: triggerLabel, config: { triggerType, triggerKey } } }],
    edges: [],
  };
  const result = await pool.query<WorkflowRecord>(
    `INSERT INTO automation_workflows (name, description, trigger_type, trigger_key, webhook_token_hash, graph)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, name, description, status, trigger_type, trigger_key, webhook_token_hash, graph, folder_id, created_at, updated_at`,
    [name, (input.description || "").slice(0, 2000), triggerType, triggerType === "event" ? triggerKey : null,
      token ? hashWorkflowToken(token) : null, JSON.stringify(graph)],
  );
  return { workflow: result.rows[0], ...(token ? { webhookToken: token } : {}) };
}

export async function updateWorkflow(id: number, input: {
  name?: string;
  description?: string;
  triggerType?: "event" | "webhook";
  triggerKey?: string;
  graph?: unknown;
  status?: "draft" | "active" | "paused";
}): Promise<WorkflowRecord | null> {
  const current = await getWorkflow(id);
  if (!current) return null;
  const triggerType = input.triggerType || current.trigger_type;
  const triggerKey = triggerType === "event"
    ? input.triggerKey || current.trigger_key || WEBHOOK_EVENT_TYPES[0]?.key || null
    : null;
  if (triggerKey && !WEBHOOK_EVENT_TYPES.some((event) => event.key === triggerKey)) throw new Error("Choose a supported event trigger.");
  const parsedGraph = input.graph === undefined ? null : workflowGraphSchema.safeParse(input.graph);
  if (parsedGraph && !parsedGraph.success) throw new Error(parsedGraph.error.issues[0]?.message || "Invalid workflow graph.");
  const graph = parsedGraph?.success ? parsedGraph.data : current.graph;
  const status = input.status || current.status;
  if (status === "active") {
    const issue = workflowReadinessIssues(graph)[0];
    if (issue) throw new Error(issue);
    if (triggerType === "event" && (!triggerKey || !WEBHOOK_EVENT_TYPES.some((event) => event.key === triggerKey))) {
      throw new Error("Choose a supported event trigger.");
    }
  }
  const result = await pool.query<WorkflowRecord>(
    `UPDATE automation_workflows SET name = $2, description = $3, trigger_type = $4, trigger_key = $5, webhook_token_hash = $6, graph = $7::jsonb, status = $8, updated_at = now()
     WHERE id = $1 AND archived_at IS NULL
     RETURNING id, name, description, status, trigger_type, trigger_key, webhook_token_hash, graph, folder_id, created_at, updated_at`,
    [id, input.name?.trim().slice(0, 160) || current.name, input.description?.slice(0, 2000) ?? current.description,
      triggerType, triggerKey,
      triggerType === "webhook"
        ? (current.trigger_type === "webhook" ? current.webhook_token_hash : hashWorkflowToken(`${TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`))
        : null,
      JSON.stringify(triggerKey && triggerType === "event" ? {
        ...graph,
        nodes: graph.nodes.map((node) => node.data.kind === "trigger"
          ? { ...node, data: { ...node.data, label: WEBHOOK_EVENT_TYPES.find((event) => event.key === triggerKey)?.label || node.data.label, config: { ...node.data.config, triggerType, triggerKey } } }
          : node),
      } : {
        ...graph,
        nodes: graph.nodes.map((node) => node.data.kind === "trigger"
          ? { ...node, data: { ...node.data, label: "Incoming webhook", config: { ...node.data.config, triggerType } } }
          : node),
      }), status],
  );
  return result.rows[0] || null;
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object") return (current as Record<string, unknown>)[key];
    return undefined;
  }, value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

function interpolate(value: string, payload: unknown, escapeValues = false): string {
  return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, key: string) => {
    const found = valueAtPath(payload, key.trim());
    const replacement = found === null || found === undefined ? "" : typeof found === "string" ? found : JSON.stringify(found);
    return escapeValues ? escapeHtml(replacement) : replacement;
  });
}

function conditionPasses(node: WorkflowNode, payload: unknown): boolean {
  const config = node.data.config;
  const actual = valueAtPath(payload, String(config.field || ""));
  const expected = config.value;
  const actualText = actual == null ? "" : String(actual).toLowerCase();
  const expectedText = expected == null ? "" : String(expected).toLowerCase();
  switch (config.operator) {
    case "equals": return actualText === expectedText;
    case "not_equals": return actualText !== expectedText;
    case "contains": return actualText.includes(expectedText);
    case "greater_than": return Number(actual) > Number(expected);
    case "less_than": return Number(actual) < Number(expected);
    case "missing": return actual === null || actual === undefined || actualText === "";
    default: return actual !== null && actual !== undefined && actualText !== "";
  }
}

async function runAction(node: WorkflowNode, payload: unknown, run: { id: number; workflow_id: number }, test?: WorkflowTestRecipient): Promise<Record<string, unknown>> {
  const config = node.data.config;
  if (node.data.kind === "email") {
    const to = (test?.email || interpolate(String(config.to || "{{contact.email}}"), payload)).trim();
    let subjectTemplate = String(config.subject || "");
    let bodyTemplate = String(config.body || "");
    let from: string | undefined;
    if (config.contentMode === "template") {
      const templateKey = String(config.templateKey || "");
      if (config.templateKind === "fixed") {
        if (templateKey === "meeting-confirmation" && !test) {
          const sent = await sendMeetingConfirmation({
            attendeeEmail: to,
            attendeeName: String(valueAtPath(payload, "contact.name") || valueAtPath(payload, "name") || "there"),
            attendeeTimeZone: String(valueAtPath(payload, "data.timezone") || "UTC"),
            meetingName: String(valueAtPath(payload, "data.meeting_name") || "Meeting"),
            scheduledStart: String(valueAtPath(payload, "data.scheduled_start") || ""),
            scheduledEnd: String(valueAtPath(payload, "data.scheduled_end") || ""),
            bookingId: Number(valueAtPath(payload, "data.booking_id")),
            calcomBookingUid: String(valueAtPath(payload, "data.calcom_booking_uid") || ""),
          });
          if (!sent) throw new Error("Meeting confirmation email could not be sent.");
          return { sent: true, recipient: to, templateKey };
        }
        const template = await getEmailTemplate(templateKey);
        subjectTemplate = template.subject;
        bodyTemplate = template.body_html;
        from = template.from_email;
      } else if (config.templateKind === "library") {
        const template = await getContentTemplate(Number(templateKey));
        if (!template) throw new Error("The selected email library template no longer exists.");
        subjectTemplate = template.subject;
        bodyTemplate = template.body_html;
      } else {
        throw new Error("Choose an email template or write a custom email.");
      }
    }
    const subject = `${test ? "[Workflow test] " : ""}${interpolate(subjectTemplate, payload)}`;
    // Action authors control the HTML template; event and contact values do
    // not. Escape substitutions so a form value can't inject markup.
    const html = interpolate(bodyTemplate, payload, true);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error(`Email action "${node.data.label}" needs a valid contact email.`);
    const allowedSenders = [emailAt("me"), emailAt("support"), emailAt("reach"), emailAt("academy")];
    if (typeof config.from === "string" && config.from && !allowedSenders.includes(config.from)) throw new Error("Choose an approved sender address for this email action.");
    if (typeof config.from === "string" && config.from) from = config.from;
    if (config.purpose === "marketing" && !test) {
      const consent = await pool.query("SELECT 1 FROM contacts WHERE normalized_email = lower(trim($1)) AND marketing_status = 'subscribed' AND deliverability_status = 'ok'", [to]);
      if (!consent.rowCount) return { skipped: true, reason: "Marketing consent or deliverability is missing." };
    }
    if (test) {
      const sent = await sendEmail({ to, subject, html, ...(from ? { from } : {}), category: "automation", isTest: true });
      if (sent.skipped) return { skipped: true, reason: "The test address is on the email suppression list." };
      if (!sent.ok) throw new Error("Test email could not be sent.");
      return { sent: true, recipient: to, subject, test: true };
    }
    const sent = await sendEmailWithRetry({ to, subject, html, ...(from ? { from } : {}), category: "automation", workflowRunId: run.id, workflowNodeId: node.id });
    if (!sent.ok && !sent.queued) throw new Error("Email could not be sent or queued for retry.");
    return { queued: sent.queued === true, recipient: to, subject };
  }
  if (node.data.kind === "whatsapp") {
    const phone = test?.phone || interpolate(String(config.phone || "{{contact.phone}}"), payload);
    if (!phone.trim()) return { skipped: true, reason: "Contact has no phone number." };
    const normalizedPhone = normalizePhoneForWhatsApp(phone);
    if (!normalizedPhone) throw new Error("WhatsApp action has an invalid phone number.");
    if (await hasOptedOut(phone)) return { skipped: true, reason: "Contact opted out of WhatsApp." };
    const templateName = String(config.templateName || "").trim();
    const languageCode = String(config.languageCode || "en").trim();
    const template = (await listWhatsAppTemplates()).find((item) => item.name === templateName && item.language === languageCode);
    if (!template || template.status !== "APPROVED") throw new Error(`WhatsApp template "${templateName}" is not approved.`);
    if (template.category === "MARKETING" && !test) {
      const contactId = Number(valueAtPath(payload, "contact.id")) || Number(valueAtPath(payload, "contact_id")) || null;
      if (!contactId || !(await canSendWhatsAppMarketing(contactId))) return { skipped: true, reason: "WhatsApp marketing consent is missing." };
    }
    const variables = Array.isArray(config.variables) ? config.variables : [];
    const components = variables.length ? [{ type: "body", parameters: variables.map((value) => ({ type: "text", text: interpolate(String(value), payload) })) }] : undefined;
    const result = await sendWhatsAppTemplateMessage(normalizedPhone, templateName, languageCode, components);
    if (!result.ok) throw new Error(result.error || "WhatsApp message was not sent.");
    return { templateName, phone: phone.replace(/\d(?=\d{4})/g, "•"), messageId: result.waMessageId, ...(test ? { test: true } : {}) };
  }
  if (node.data.kind === "google_review_request") {
    if (test) return { skipped: true, reason: "Google review requests are queued only for a real subscribed contact." };
    const contactId = Number(valueAtPath(payload, "contact.id") || valueAtPath(payload, "contact_id"));
    if (!contactId) throw new Error("Google review request needs a CRM contact.");
    const requestId = await queueGoogleReviewRequest({
      contactId,
      templateKey: String(config.templateKey || "google-review-request"),
      automationWorkflowId: run.workflow_id,
      automationWorkflowRunId: run.id,
      automationWorkflowNodeId: node.id,
    });
    return { queued: true, requestId };
  }
  if (node.data.kind === "course_access") {
    const email = interpolate(String(config.email || "{{contact.email}}"), payload).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Course access needs a valid recipient email.");
    const courseId = Number(config.courseId);
    if (!Number.isInteger(courseId) || courseId < 1) throw new Error("Choose a course for the access action.");
    const courseResult = await pool.query<{ id: number; slug: string; title: string }>("SELECT id, slug, title FROM courses WHERE id = $1", [courseId]);
    const course = courseResult.rows[0];
    if (!course) throw new Error("The selected course no longer exists.");
    const name = String(valueAtPath(payload, "contact.name") || valueAtPath(payload, "name") || "").trim() || null;
    const account = await findOrCreateAccount(email, name);
    const existing = await pool.query<{ tier: string }>("SELECT tier FROM course_enrollments WHERE user_id = $1 AND course_id = $2", [account.id, course.id]);
    const requestedTier = config.tier === "pro" ? "pro" : "free";
    // An automation granting free access must not downgrade an existing PRO
    // learner; PRO remains the effective tier and the existing helper handles
    // the account/access email and sign-in link.
    const tier = existing.rows[0]?.tier === "pro" ? "pro" : requestedTier;
    await grantCourseManually(account, course, tier);
    return { courseId: course.id, course: course.title, tier, recipient: email, createdAccount: account.created };
  }
  if (node.data.kind === "contact_unsubscribe") {
    const contactId = Number(valueAtPath(payload, "contact.id") || valueAtPath(payload, "contact_id"));
    const email = String(valueAtPath(payload, "contact.email") || valueAtPath(payload, "email") || "").trim().toLowerCase();
    if (!contactId && !email) throw new Error("Unsubscribe action needs a contact or email address.");
    const result = await pool.query<{ id: number; email: string }>(
      `UPDATE contacts SET marketing_status = 'unsubscribed', updated_at = now()
       WHERE ${contactId ? "id = $1" : "normalized_email = $1"} RETURNING id, email`,
      [contactId || email],
    );
    const contact = result.rows[0];
    if (!contact) return { skipped: true, reason: "No CRM contact matched this event." };
    await pool.query("INSERT INTO email_suppressions (email) VALUES ($1) ON CONFLICT (email) DO NOTHING", [contact.email.trim().toLowerCase()]);
    await pool.query("UPDATE newsletter_subscribers SET unsubscribed_at = COALESCE(unsubscribed_at, now()) WHERE lower(trim(email)) = $1", [contact.email.trim().toLowerCase()]);
    return { unsubscribed: true, contactId: contact.id };
  }
  if (node.data.kind === "contact_update") {
    const contactId = Number(valueAtPath(payload, "contact.id") || valueAtPath(payload, "contact_id"));
    const email = String(valueAtPath(payload, "contact.email") || valueAtPath(payload, "email") || "").trim().toLowerCase();
    const field = String(config.field || "");
    if (field !== "name" && field !== "phone") throw new Error("Choose name or phone as the contact field to update.");
    const value = interpolate(String(config.value || ""), payload).trim();
    if (!value) throw new Error("Contact update value is empty.");
    if (!contactId && !email) throw new Error("Contact update needs a contact or email address.");
    const updated = await pool.query(
      `UPDATE contacts SET ${field} = $2, updated_at = now() WHERE ${contactId ? "id = $1" : "normalized_email = $1"} RETURNING id`,
      [contactId || email, value],
    );
    if (!updated.rowCount) return { skipped: true, reason: "No CRM contact matched this event." };
    return { updated: true, field, contactId: updated.rows[0].id };
  }
  if (node.data.kind === "contact_delete") {
    const contactId = Number(valueAtPath(payload, "contact.id") || valueAtPath(payload, "contact_id"));
    const email = String(valueAtPath(payload, "contact.email") || valueAtPath(payload, "email") || "").trim().toLowerCase();
    if (config.confirm !== true) throw new Error("Confirm the contact removal action before activating this workflow.");
    const removed = await withTransaction(async (client) => {
      const found = contactId
        ? await client.query<{ id: number; email: string; marketing_status: string; deliverability_status: string }>("SELECT id,email,marketing_status,deliverability_status FROM contacts WHERE id=$1 FOR UPDATE", [contactId])
        : email
          ? await client.query<{ id: number; email: string; marketing_status: string; deliverability_status: string }>("SELECT id,email,marketing_status,deliverability_status FROM contacts WHERE normalized_email=$1 FOR UPDATE", [email])
          : { rows: [] };
      const contact = found.rows[0];
      if (!contact) return null;
      const blocked = contact.marketing_status === "unsubscribed" || ["bounced", "invalid", "suppressed"].includes(contact.deliverability_status);
      if (!blocked) throw new Error("Contact removal is allowed only for an unsubscribed, hard-bounced, or invalid contact. Spam complaint records must be retained.");
      await client.query("INSERT INTO email_suppressions(email) VALUES ($1) ON CONFLICT DO NOTHING", [contact.email.toLowerCase()]);
      await client.query("DELETE FROM contacts WHERE id=$1", [contact.id]);
      return { id: Number(contact.id), email: contact.email.replace(/(^.).*(@.*$)/, "$1•••$2") };
    });
    if (!removed) return { skipped: true, reason: "Contact was already removed." };
    return { removed: true, contactId: removed.id, email: removed.email, emailSuppressionRetained: true };
  }
  if (node.data.kind === "webhook") {
    const url = interpolate(String(config.url || ""), payload).trim();
    const secret = process.env.WEBHOOK_SHARED_SECRET || process.env.CRON_SECRET;
    if (!secret) throw new Error("Set WEBHOOK_SHARED_SECRET or CRON_SECRET to sign outgoing workflow webhooks.");
    const bodyJson = JSON.stringify({ workflowId: run.workflow_id, runId: run.id, nodeId: node.id, payload, ...(test ? { test: true } : {}) });
    const result = await deliverWebhookAttempt({
      url, secret, eventUuid: crypto.randomUUID(), eventType: test ? "workflow.test" : "workflow.action", bodyJson,
    });
    if (result.outcome !== "delivered") throw new Error(result.errorMessage || `Webhook returned HTTP ${result.httpStatus || "error"}.`);
    return { httpStatus: result.httpStatus, response: result.responseExcerpt };
  }
  return {};
}

async function executeRun(run: { id: number; workflow_id: number; trigger_payload: unknown; graph: WorkflowGraph; node_results: Record<string, unknown> }, test?: WorkflowTestRecipient) {
  const rawPayload = run.trigger_payload && typeof run.trigger_payload === "object" ? run.trigger_payload as Record<string, unknown> : {};
  const eventData = rawPayload.data && typeof rawPayload.data === "object" ? rawPayload.data as Record<string, unknown> : {};
  const email = String(eventData.email || rawPayload.email || "").trim().toLowerCase();
  const contactId = Number(rawPayload.contact_id) || null;
  const contactResult = test
    ? { rows: [{ id: null, email: test.email || "", name: "Workflow test", phone: test.phone || "", marketing_status: "unknown", whatsapp_status: "unknown" }] }
    : contactId
      ? await pool.query("SELECT id, email, name, phone, marketing_status, whatsapp_status FROM contacts WHERE id = $1", [contactId])
    : email
      ? await pool.query("SELECT id, email, name, phone, marketing_status, whatsapp_status FROM contacts WHERE normalized_email = $1", [email])
      : { rows: [] };
  const contact = contactResult.rows[0] || {};
  const firstName = String(contact.name || "").trim().split(/\s+/)[0] || "there";
  const workflowData = { ...eventData };
  if (!workflowData.course_url && typeof workflowData.course_slug === "string") {
    workflowData.course_url = `${SITE_URL}/account/courses/${encodeURIComponent(workflowData.course_slug)}`;
  }
  if (!workflowData.guide_url && typeof workflowData.guide === "string") {
    workflowData.guide_url = `${SITE_URL}/guide/${encodeURIComponent(workflowData.guide)}?unlocked=1`;
  }
  const payload = {
    ...rawPayload,
    ...workflowData,
    first_name: workflowData.first_name || firstName,
    name: workflowData.name || contact.name || "",
    email: workflowData.email || contact.email || "",
    phone: workflowData.phone || contact.phone || "",
    contact: { ...contact, first_name: firstName },
    data: workflowData,
  };
  const trigger = run.graph.nodes.find((node) => node.data.kind === "trigger");
  if (!trigger) throw new Error("Workflow trigger node is missing.");
  if (!test) {
    const triggerConfig = trigger.data.config;
    const recipientEmail = String(payload.contact?.email || payload.email || "").trim().toLowerCase();
    const goalType = String(triggerConfig.goalType || "none") as "none" | "course_pro" | "course_completed" | "community_first_post";
    if (goalType !== "none" && recipientEmail && await automationGoalReached(goalType, recipientEmail, Number(triggerConfig.courseId) || null)) {
      return { __workflowExited: true, reason: "Entry goal already reached." };
    }
    const segmentId = Number(triggerConfig.entrySegmentId) || null;
    if (segmentId) {
      const segment = await pool.query("SELECT rules FROM contact_segments WHERE id = $1", [segmentId]);
      if (!segment.rows[0] || !contact.id) return { __workflowExited: true, reason: "Contact does not match the entry segment." };
      const predicate = buildSegmentPredicate(segment.rows[0].rules, 2);
      const matches = await pool.query(`SELECT 1 FROM contacts c WHERE c.id = $1 AND ${predicate.sql} LIMIT 1`, [contact.id, ...predicate.values]);
      if (!matches.rowCount) return { __workflowExited: true, reason: "Contact does not match the entry segment." };
    }
    if (triggerConfig.purpose === "marketing" && contact.id) {
      const consent = await pool.query("SELECT 1 FROM contacts WHERE id=$1 AND marketing_status='subscribed' AND deliverability_status='ok'", [contact.id]);
      if (!consent.rowCount) return { __workflowExited: true, reason: "Marketing consent or deliverability is missing." };
    }
  }
  const outgoing = (nodeId: string) => run.graph.edges.filter((edge) => edge.source === nodeId);
  const results = { ...(run.node_results || {}) };
  const savedQueue = Array.isArray(results.__workflowQueue) ? results.__workflowQueue as { id: string; handle: string | null }[] : null;
  delete results.__workflowQueue;
  const queue = savedQueue || outgoing(trigger.id).map((edge) => ({ id: edge.target, handle: edge.sourceHandle || null }));
  const visited = new Set<string>();
  while (queue.length) {
    if (visited.size > 100) throw new Error("Workflow exceeded the 100-node run limit.");
    const current = queue.shift()!;
    const node = run.graph.nodes.find((item) => item.id === current.id);
    if (!node || visited.has(node.id) || node.data.kind === "trigger") continue;
    visited.add(node.id);
    if (!test && ["email", "whatsapp", "google_review_request"].includes(node.data.kind)) {
      const triggerConfig = trigger.data.config;
      const goalType = String(triggerConfig.goalType || "none") as "none" | "course_pro" | "course_completed" | "community_first_post";
      const recipientEmail = String(payload.contact?.email || payload.email || "").trim().toLowerCase();
      if (goalType !== "none" && recipientEmail && await automationGoalReached(goalType, recipientEmail, Number(triggerConfig.courseId) || null)) {
        results.__workflowExited = { reason: "The workflow exit goal has been reached." };
        break;
      }
    }
    if (!test && trigger.data.config.triggerKey === "course.inactivity" && ["email", "whatsapp"].includes(node.data.kind)) {
      const enrollmentId = Number(valueAtPath(payload, "data.enrollment_id"));
      const courseId = Number(valueAtPath(payload, "data.course_id"));
      const learnerStillNeedsCourse = await pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM course_enrollments ce
           WHERE ce.id = $1 AND ce.course_id = $2
             AND EXISTS (
               SELECT 1 FROM course_lessons l JOIN course_modules m ON m.id = l.module_id
               WHERE m.course_id = ce.course_id AND (ce.tier = 'pro' OR m.tier = 'free')
             )
             AND EXISTS (
               SELECT 1 FROM course_lessons l JOIN course_modules m ON m.id = l.module_id
               WHERE m.course_id = ce.course_id AND (ce.tier = 'pro' OR m.tier = 'free')
                 AND NOT EXISTS (SELECT 1 FROM lesson_progress lp WHERE lp.lesson_id = l.id AND lp.user_id = ce.user_id)
             )
         ) AS should_continue`,
        [enrollmentId, courseId],
      );
      if (!learnerStillNeedsCourse.rows[0]?.should_continue) break;
    }
    if (node.data.kind === "condition") {
      const passed = conditionPasses(node, payload);
      results[node.id] = { passed };
      queue.push(...outgoing(node.id).filter((edge) => edge.sourceHandle === (passed ? "true" : "false")).map((edge) => ({ id: edge.target, handle: edge.sourceHandle || null })));
      continue;
    }
    if (node.data.kind === "email_condition") {
      const config = node.data.config;
      const sourceNodeId = String(config.emailNodeId || "");
      let sent = false, opened = false, clicked = false;
      if (test) {
        sent = true;
        opened = config.testEngagement === "opened" || config.testEngagement === "clicked";
        clicked = config.testEngagement === "clicked";
      } else {
        const delivery = await pool.query<{ sent_at: Date | null; first_opened_at: Date | null; first_clicked_at: Date | null }>(
          `SELECT sent_at, first_opened_at, first_clicked_at FROM email_deliveries
           WHERE workflow_run_id = $1 AND workflow_node_id = $2 AND is_test = false ORDER BY id DESC LIMIT 1`,
          [run.id, sourceNodeId],
        );
        sent = !!delivery.rows[0]?.sent_at;
        opened = !!(delivery.rows[0]?.first_opened_at || delivery.rows[0]?.first_clicked_at);
        clicked = !!delivery.rows[0]?.first_clicked_at;
      }
      const condition = String(config.condition || "opened");
      const passed = condition === "opened" ? sent && opened
        : condition === "not_opened" ? sent && !opened
        : condition === "clicked" ? sent && clicked
        : condition === "not_clicked" ? sent && !clicked : false;
      results[node.id] = { passed };
      queue.push(...outgoing(node.id).filter((edge) => edge.sourceHandle === (passed ? "true" : "false")).map((edge) => ({ id: edge.target, handle: edge.sourceHandle || null })));
      continue;
    }
    if (node.data.kind === "wait") {
      const duration = Number(node.data.config.duration);
      const multiplier = node.data.config.unit === "minutes" ? 60_000 : node.data.config.unit === "hours" ? 3_600_000 : 86_400_000;
      if (!Number.isFinite(duration) || duration < 1 || duration * multiplier > 365 * 86_400_000) throw new Error(`Wait node "${node.data.label}" must be between 1 minute and 365 days.`);
      const anchorPath = String(node.data.config.anchorPath || "");
      const anchorValue = anchorPath ? valueAtPath(payload, anchorPath) : null;
      const anchorTime = anchorValue ? new Date(String(anchorValue)).getTime() : Date.now();
      if (!Number.isFinite(anchorTime)) throw new Error(`Wait node "${node.data.label}" received an invalid anchor date.`);
      if (test) {
        results[node.id] = { skippedWait: true, test: true };
        queue.push(...outgoing(node.id).map((edge) => ({ id: edge.target, handle: edge.sourceHandle || null })));
        continue;
      }
      const waitUntil = new Date(Math.max(Date.now(), anchorTime + duration * multiplier));
      const continuation = [...queue, ...outgoing(node.id).map((edge) => ({ id: edge.target, handle: edge.sourceHandle || null }))];
      await pool.query(
        "UPDATE automation_workflow_runs SET status = 'queued', started_at = NULL, wait_until = $2, node_results = $3::jsonb WHERE id = $1",
        [run.id, waitUntil, JSON.stringify({ ...results, [node.id]: { waitUntil: waitUntil.toISOString() }, __workflowQueue: continuation })],
      );
      return { ...results, __waitScheduled: true };
    }
    if (node.data.kind === "stop") continue;
    if (test && ["course_access", "contact_update", "contact_unsubscribe", "contact_delete"].includes(node.data.kind)) {
      results[node.id] = { skipped: true, reason: "This action changes account or contact access and is held during a workflow test." };
      queue.push(...outgoing(node.id).map((edge) => ({ id: edge.target, handle: edge.sourceHandle || null })));
      continue;
    }
    if (!(node.id in results)) {
      try {
        const result = await runAction(node, payload, run, test);
        results[node.id] = result;
        if (!test) await pool.query("UPDATE automation_workflow_runs SET node_results = $2::jsonb WHERE id = $1", [run.id, JSON.stringify(results)]);
      } catch (error) {
        if (test) return { ...results, [node.id]: { error: error instanceof Error ? error.message : "Workflow action failed." }, __testFailedNode: node.id };
        throw error;
      }
    }
    queue.push(...outgoing(node.id).map((edge) => ({ id: edge.target, handle: edge.sourceHandle || null })));
  }
  return results;
}

/** Executes a manual test against the current graph. Waits are skipped and
 * communications are redirected to the administrator-supplied test address. */
export async function executeWorkflowTest(input: {
  workflowId: number;
  graph: WorkflowGraph;
  triggerKey: string;
  recipient: WorkflowTestRecipient;
}): Promise<Record<string, unknown>> {
  const issues = workflowReadinessIssues(input.graph);
  if (issues.length) throw new Error(issues[0]);
  const trigger = input.graph.nodes.find((node) => node.data.kind === "trigger");
  if (!trigger) throw new Error("Workflow trigger node is missing.");
  const data: Record<string, unknown> = {
    source: "workflow_test",
    email: input.recipient.email || "",
    phone: input.recipient.phone || "",
    enrollment_id: null,
    course_id: trigger.data.config.courseId || null,
    course_slug: "sample-course",
    course_title: "Sample course",
    inactiveDays: trigger.data.config.inactiveDays || 3,
  };
  const payload: Record<string, unknown> = {
    event_type: input.triggerKey || "workflow.test",
    source: "workflow_test",
    data,
    email: data.email,
    phone: data.phone,
    name: "Workflow test",
    first_name: "Workflow",
    contact: { id: null, email: data.email, name: "Workflow test", phone: data.phone },
    contact_id: null,
    _workflow_test: true,
  };
  // Test the configured path by giving conditions their configured values.
  for (const node of input.graph.nodes.filter((item) => item.data.kind === "condition")) {
    const config = node.data.config;
    const keys = String(config.field || "").split(".").filter(Boolean);
    if (!keys.length) continue;
    let parent = payload;
    for (const key of keys.slice(0, -1)) {
      if (!parent[key] || typeof parent[key] !== "object") parent[key] = {};
      parent = parent[key] as Record<string, unknown>;
    }
    if (config.operator === "missing") delete parent[keys[keys.length - 1]];
    else if (config.operator === "equals" || config.operator === "contains") parent[keys[keys.length - 1]] = config.value ?? "sample-value";
    else if (config.operator === "greater_than") parent[keys[keys.length - 1]] = Number(config.value || 0) + 1;
    else if (config.operator === "less_than") parent[keys[keys.length - 1]] = Number(config.value || 0) - 1;
    else if (config.operator === "not_equals") parent[keys[keys.length - 1]] = "sample-value";
    else parent[keys[keys.length - 1]] = "sample-value";
  }
  return executeRun({ id: 0, workflow_id: input.workflowId, trigger_payload: payload, graph: input.graph, node_results: {} }, input.recipient);
}

/** Claims due runs with SKIP LOCKED so overlapping cron invocations do not execute the same run. */
export async function dispatchWorkflowRuns(limit = 20): Promise<{ completed: number; failed: number; waiting: number }> {
  const claimed = await pool.query(
    `UPDATE automation_workflow_runs r SET status = 'running', started_at = now(), wait_until = NULL
     WHERE r.id IN (
       SELECT id FROM automation_workflow_runs
       WHERE (status = 'queued' AND (wait_until IS NULL OR wait_until <= now())) OR (status = 'running' AND started_at < now() - interval '15 minutes')
       ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT $1
     ) RETURNING r.id, r.workflow_id, r.trigger_payload, r.node_results`, [limit],
  );
  let completed = 0;
  let failed = 0;
  let waiting = 0;
  for (const run of claimed.rows) {
    const workflow = await getWorkflow(Number(run.workflow_id));
    try {
      if (!workflow || workflow.status !== "active") throw new Error("Workflow is no longer active.");
      const nodeResults = await executeRun({ ...run, id: Number(run.id), workflow_id: Number(run.workflow_id), graph: workflow.graph });
      if (nodeResults.__waitScheduled === true) {
        waiting++;
        continue;
      }
      await pool.query("UPDATE automation_workflow_runs SET status = 'completed', node_results = $2::jsonb, finished_at = now(), error = null WHERE id = $1", [run.id, JSON.stringify(nodeResults)]);
      completed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workflow action failed.";
      await pool.query("UPDATE automation_workflow_runs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1", [run.id, message.slice(0, 1000)]);
      failed++;
    }
  }
  return { completed, failed, waiting };
}
