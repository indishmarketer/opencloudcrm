import { pool } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { sendDirectoryEmail, type DirectoryEmailKey } from "@/lib/directoryEmails";
import { escapeHtml } from "@/lib/escapeHtml";
import { isAuthorizedConsoleEmail } from "@/lib/consoleAdmins";
import { isOwnedR2Url } from "@/lib/r2Upload";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { SITE_URL } from "@/lib/siteMeta";
import { PRICING_TYPES, cleanToolUrl } from "@/lib/directoryFields";

export { cleanToolUrl };

export const MAX_SCREENSHOTS = 4;

/** Screenshots must be images we host (uploaded through our own upload
 * route), never arbitrary outside URLs. */
export function cleanScreenshots(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((s): s is string => typeof s === "string" && isOwnedR2Url(s))
    .slice(0, MAX_SCREENSHOTS);
}

export type ToolFields = {
  name: string;
  tagline: string | null;
  description: string | null;
  category_id: number;
  pricing_type: string;
  website_url: string;
  screenshots: string[];
};

/** Validates the fields a submitter is allowed to set or change. */
export async function parseToolFields(body: Record<string, unknown>): Promise<{ fields: ToolFields } | { error: string }> {
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (!name) return { error: "Tool name is required." };
  const websiteUrl = cleanToolUrl(body.website_url);
  if (!websiteUrl) return { error: "Enter a valid website or GitHub link starting with https://" };
  const pricing = String(body.pricing_type || "");
  if (!(PRICING_TYPES as readonly string[]).includes(pricing)) return { error: "Pick a valid pricing type." };
  const categoryId = Number(body.category_id);
  if (!Number.isInteger(categoryId)) return { error: "Pick a category." };
  const category = await pool.query("SELECT 1 FROM directory_categories WHERE id = $1", [categoryId]);
  if (category.rows.length === 0) return { error: "That category no longer exists." };
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;
  return {
    fields: {
      name,
      tagline: text(body.tagline, 300),
      description: text(body.description, 6000),
      category_id: categoryId,
      pricing_type: pricing,
      website_url: websiteUrl,
      screenshots: cleanScreenshots(body.screenshots),
    },
  };
}

type Submitter = { email: string; name: string | null; isAdmin: boolean };

/** Who submitted a tool, and whether they're a console admin (admins
 * adding their own tools don't get submitter emails). Null for tools
 * added in the console or through the API. */
export async function getSubmitter(toolId: number): Promise<Submitter | null> {
  const result = await pool.query(
    `SELECT u.email, u.name FROM directory_tools t JOIN users u ON u.id = t.submitted_by_user_id WHERE t.id = $1`,
    [toolId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { email: row.email, name: row.name, isAdmin: await isAuthorizedConsoleEmail(row.email) };
}

/** Multi-line admin note, safe for the email body. */
export function noteHtml(note: string | null | undefined) {
  return note && note.trim() ? escapeHtml(note.trim()).replace(/\n/g, "<br>") : "";
}

export function toolUrls(tool: { id: number; slug: string; category_slug: string }) {
  return {
    tool_url: `${SITE_URL}/tools/${tool.category_slug}/${tool.slug}`,
    edit_url: `${SITE_URL}/account/tools/${tool.id}`,
    manage_url: `${SITE_URL}/account/tools`,
  };
}

/** Sends one built-in submitter email (see directoryEmails.ts). Skipped
 * when there's no submitter or the submitter is a console admin. `vars`
 * are plain text. Returns whether an email went out. */
export async function emailSubmitter(
  toolId: number,
  key: DirectoryEmailKey,
  vars: Record<string, string | null | undefined>
): Promise<boolean> {
  const submitter = await getSubmitter(toolId);
  if (!submitter || submitter.isAdmin) return false;
  const first = (submitter.name || "there").trim().split(/s+/)[0] || "there";
  const result = await sendDirectoryEmail(key, submitter.email, { first_name: first, ...vars });
  return result.ok && !result.skipped;
}

/** Tells the owner a tool needs review. Skipped when an admin did it. */
export async function notifyAdminOfTool(submitterEmail: string, eventText: string, toolName: string) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || (await isAuthorizedConsoleEmail(submitterEmail))) return;
  await sendDirectoryEmail("tool-submission-admin-notify", adminEmail, {
    submitter_email: submitterEmail, event_text: eventText, tool_name: toolName, console_url: `${SITE_URL}/console/directory`,
  }, { replyTo: submitterEmail });
}

async function loadTool(toolId: number) {
  const result = await pool.query(
    `SELECT t.id, t.slug, t.name, t.website_url, t.pricing_type, t.status, t.listing_tier, t.paid_at, t.approved_email_sent_at, c.slug AS category_slug
     FROM directory_tools t JOIN directory_categories c ON c.id = t.category_id WHERE t.id = $1`,
    [toolId]
  );
  return result.rows[0] || null;
}

/** Each review decision is a separate event, including a later publish after payment. */
export async function emitToolReviewEvent(toolId: number, status: string, note: string | null = null): Promise<void> {
  const tool = await loadTool(toolId);
  if (!tool) return;
  const submitter = await getSubmitter(toolId);
  const urls = toolUrls(tool);
  await emitWebhookEvent({
    eventType: "directory_tool.reviewed",
    source: "directory_tools",
    sourceRecordId: `${toolId}:${status}:${randomUUID()}`,
    contactEmail: submitter?.email || null,
    contactName: submitter?.name || null,
    data: { tool_id: toolId, tool_name: tool.name, website_url: tool.website_url,
      pricing_type: tool.pricing_type, status, note, payment_url: urls.manage_url, ...urls },
  });
  if (status === "published") {
    // One event per publication, so a re-published tool fires again.
    await emitWebhookEvent({
      eventType: "directory_tool.published",
      source: "directory_tools",
      sourceRecordId: `${toolId}:published:${randomUUID()}`,
      contactEmail: submitter?.email || null,
      contactName: submitter?.name || null,
      data: { tool_id: toolId, tool_name: tool.name, website_url: tool.website_url, pricing_type: tool.pricing_type,
        listing_tier: tool.listing_tier, category: tool.category_slug, ...urls },
    });
  }
}

/** Fired when a paid listing's fee clears, whether or not it has been
 * reviewed yet, so a workflow can wait on the payment. */
export async function emitToolPaidEvent(toolId: number): Promise<void> {
  const tool = await loadTool(toolId);
  if (!tool) return;
  const submitter = await getSubmitter(toolId);
  await emitWebhookEvent({
    eventType: "directory_tool.paid",
    source: "directory_tools",
    sourceRecordId: toolId,
    contactEmail: submitter?.email || null,
    contactName: submitter?.name || null,
    data: { tool_id: toolId, tool_name: tool.name, website_url: tool.website_url, listing_tier: tool.listing_tier, status: tool.status, ...toolUrls(tool) },
  });
}

/** Sends the "your tool is live" email once per tool. Marked as sent
 * before sending so two clicks can't send it twice. */
export async function sendApprovedEmail(toolId: number): Promise<"sent" | "skipped" | "already"> {
  const tool = await loadTool(toolId);
  if (!tool || tool.status !== "published") return "skipped";
  const claimed = await pool.query(
    "UPDATE directory_tools SET approved_email_sent_at = now() WHERE id = $1 AND approved_email_sent_at IS NULL RETURNING id",
    [toolId]
  );
  if (claimed.rowCount === 0) return "already";
  try {
    const urls = toolUrls(tool);
    const sent = await emailSubmitter(toolId, "tool-submission-approved", {
      tool_name: tool.name,
      tool_url: urls.tool_url,
      manage_url: urls.manage_url,
    });
    return sent ? "sent" : "skipped";
  } catch (err) {
    await pool.query("UPDATE directory_tools SET approved_email_sent_at = NULL WHERE id = $1", [toolId]);
    throw err;
  }
}

export type ReviewAction = "approve" | "request_changes" | "reject";

/** One review decision on a submission. Each decision sends its built-in
 * email (directoryEmails.ts) and also emits a workflow event. */
export async function reviewTool(
  toolId: number,
  action: ReviewAction,
  note: string | null
): Promise<{ ok: true; email: "sent" | "skipped" | "already" } | { ok: false; error: string }> {
  const tool = await loadTool(toolId);
  if (!tool) return { ok: false, error: "Tool not found." };
  const cleanNote = note?.trim().slice(0, 3000) || null;
  const emitReviewed = (status: string) => emitToolReviewEvent(toolId, status, cleanNote).catch(() => {});

  if (action === "approve") {
    // A paid listing that already paid during the submit flow publishes
    // straight away. Only one that has not paid goes to 'approved_unpaid'
    // and gets the payment email.
    if (tool.listing_tier === "paid" && !tool.paid_at) {
      await pool.query(
        "UPDATE directory_tools SET status = 'approved_unpaid', review_note = NULL, reviewed_at = now(), updated_at = now() WHERE id = $1",
        [toolId],
      );
      await emitReviewed("approved_unpaid");
      const sent = await emailSubmitter(toolId, "tool-submission-approved-payment", { tool_name: tool.name, payment_url: toolUrls(tool).manage_url });
      return { ok: true, email: sent ? "sent" : "skipped" };
    }
    await pool.query(
      "UPDATE directory_tools SET status = 'published', review_note = NULL, reviewed_at = now(), updated_at = now() WHERE id = $1",
      [toolId]
    );
    await emitReviewed("published");
    return { ok: true, email: await sendApprovedEmail(toolId) };
  }

  if (action === "request_changes") {
    if (!cleanNote) return { ok: false, error: "Write what needs to change." };
    if (tool.status === "published") return { ok: false, error: "This tool is already live. Edit it directly instead." };
    await pool.query(
      "UPDATE directory_tools SET status = 'changes_requested', review_note = $1, reviewed_at = now(), updated_at = now() WHERE id = $2",
      [cleanNote, toolId]
    );
    const sent = await emailSubmitter(toolId, "tool-submission-changes-requested", { tool_name: tool.name, note: cleanNote, edit_url: toolUrls(tool).edit_url });
    await emitReviewed("changes_requested");
    return { ok: true, email: sent ? "sent" : "skipped" };
  }

  await pool.query(
    "UPDATE directory_tools SET status = 'rejected', review_note = $1, reviewed_at = now(), updated_at = now() WHERE id = $2",
    [cleanNote, toolId]
  );
  await emitReviewed("rejected");
  const sent = await emailSubmitter(toolId, "tool-submission-rejected", { tool_name: tool.name, note: cleanNote });
  return { ok: true, email: sent ? "sent" : "skipped" };
}
