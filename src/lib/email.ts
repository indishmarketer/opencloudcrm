import { pool } from "@/lib/db";
import crypto from "node:crypto";
import { createUnsubscribeToken } from "@/lib/emailUnsubscribe";
import { createEmailClickToken, createEmailOpenToken } from "@/lib/emailOpenTracking";
import { ensureContact } from "@/lib/contacts";
import { wrapEmailHtml } from "@/lib/emailShell";
import { sendViaSes } from "@/lib/sesEmail";
import { sendViaBrevo } from "@/lib/brevoEmail";
import { SITE_NAME } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";
import { getReplyToEmail } from "@/lib/businessProfile";

const EMAIL_DOMAIN = new URL(SITE_URL).hostname.replace(/^www\./, "");

type EmailProvider = "ses" | "brevo";

/** Which provider actually has credentials set, right now. `EMAIL_PROVIDER`
 * picks explicitly when both are configured; otherwise SES wins if both are
 * set (this project's original provider, so an existing deployment's
 * behavior never changes just because someone also added a Brevo key). */
function resolveProvider(): EmailProvider | null {
  const explicit = process.env.EMAIL_PROVIDER?.toLowerCase();
  if (explicit === "ses" || explicit === "brevo") return explicit;
  if (process.env.SES_ACCESS_KEY_ID && process.env.SES_SECRET_ACCESS_KEY && process.env.SES_REGION) return "ses";
  if (process.env.BREVO_API_KEY) return "brevo";
  return null;
}

/** For callers that need to know, before attempting a send, whether ANY
 * provider is usable -- e.g. the magic-link login route falls back to
 * logging the link instead of silently failing when this is false. */
export function isEmailProviderConfigured(): boolean {
  return resolveProvider() !== null;
}

function withFooter(html: string, unsubscribeUrl: string): string {
  return `${html}
<hr style="margin-top:32px;border:none;border-top:1px solid #e2e2e0;">
<p style="margin-top:16px;font-size:12px;color:#4b4b4b;line-height:1.5;">
  ${SITE_NAME} &middot; Near Tender Care School, Kench&apos;s Trace, Shillong, Meghalaya 793004, India<br>
  <a href="${unsubscribeUrl}" style="color:#4b4b4b;">Unsubscribe</a>
</p>`;
}

/** Best-effort log to email_events -- the central send/delivery record
 * powering /console/email/analytics. Never throws: a logging failure must
 * never block or fail the actual email send. */
async function logEmailEvent(row: {
  deliveryId?: number | null;
  templateKey: string | null;
  category: string;
  recipientEmail: string;
  messageId: string | null;
  event: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await pool.query(
      `INSERT INTO email_events (delivery_id, template_key, category, recipient_email, message_id, event, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [row.deliveryId ?? null, row.templateKey, row.category, row.recipientEmail.toLowerCase(), row.messageId, row.event, JSON.stringify(row.meta || {})]
    );
  } catch (e) {
    console.error("email_events insert failed (non-fatal):", e);
  }
}

async function updateDelivery(deliveryId: number | null, sql: string, values: unknown[] = []) {
  if (!deliveryId) return;
  try {
    await pool.query(`UPDATE email_deliveries SET ${sql} WHERE id = $1`, [deliveryId, ...values]);
  } catch (error) {
    console.error("email_deliveries update failed (non-fatal):", error);
  }
}

async function trackLinks(html: string, deliveryId: number | null): Promise<string> {
  if (!deliveryId) return html;
  const matches = [...html.matchAll(/href=(['"])(https?:\/\/[^'"]+)\1/gi)];
  let output = html;
  for (const match of matches) {
    const target = match[2].replace(/&amp;/g, "&");
    if (target.includes("/api/email/track/") || target.includes("/unsubscribe?")) continue;
    // Sign-in, reset and verification links carry a one-time token: routing
    // them through the tracker would store that token in email_events.
    if (/[?&]token=/i.test(target)) continue;
    const token = await createEmailClickToken(deliveryId, target);
    const replacement = `href=${match[1]}${SITE_URL}/api/email/track/click?t=${token}${match[1]}`;
    output = output.replace(match[0], replacement);
  }
  return output;
}

export async function sendEmail({
  to,
  subject,
  html,
  from,
  replyTo,
  critical,
  templateKey,
  category,
  trackOpens,
  trackClicks,
  campaignId,
  flowStepId,
  flowRunId,
  workflowRunId,
  workflowNodeId,
  isTest,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  /** Account-security mail only (password reset, magic link, OTP) -- skips
   * the suppression check so someone who unsubscribed can still recover
   * their account. The unsubscribe link/footer is still shown either way;
   * this only affects whether the send itself is skipped. */
  critical?: boolean;
  /** email_templates.key, when this send came from a Fixed Email template.
   * Powers per-template analytics; omit for ad hoc/system sends. */
  templateKey?: string;
  /** Groups this send in analytics: 'fixed' | 'automation' | 'campaign' |
   * 'system'. Defaults to 'system' (e.g. test sends, ad hoc admin mail). */
  category?: string;
  /** Injects a hidden open-tracking pixel. Defaults to true unless the
   * caller (e.g. the email-verification template) explicitly opts out. */
  trackOpens?: boolean;
  /** Rewrites http(s) links through the first-party click tracker. */
  trackClicks?: boolean;
  campaignId?: number;
  flowStepId?: number;
  /** Durable automation journey instance for behavioral branching. */
  flowRunId?: number;
  /** Shared visual workflow run/node used for delivery analytics and email conditions. */
  workflowRunId?: number;
  workflowNodeId?: string;
  /** Excludes diagnostics from production engagement analytics. */
  isTest?: boolean;
  /** Base64-encoded file attachments, e.g. a calendar invite from
   * src/lib/ics.ts -- sent as application/octet-stream, so mail clients
   * go by the filename extension; name .ics attachments accordingly. */
  attachments?: { name: string; content: string }[];
}) {
  // Amazon SES (src/lib/sesEmail.ts) or Brevo (src/lib/brevoEmail.ts),
  // whichever has credentials set -- see resolveProvider() above. SES
  // delivery/bounce/complaint events come back via
  // /api/webhooks/ses-sns; Brevo doesn't have an equivalent wired up yet.
  const provider = resolveProvider();
  // info@indishmarketer.com is a receive-only inbox (the owner's real
  // forwarding target), never an automated "From" identity -- support@ is
  // the safe fallback if a call site somehow omits `from`.
  const sender = from || process.env.EMAIL_FROM || `support@${EMAIL_DOMAIN}`;
  const resolvedCategory = category || "system";
  const resolvedTemplateKey = templateKey || null;
  const normalizedTo = to.trim().toLowerCase();
  let deliveryId: number | null = null;

  try {
    const contactId = isTest ? null : await ensureContact({ email: normalizedTo });
    const delivery = await pool.query<{ id: string }>(
      `INSERT INTO email_deliveries
         (tracking_id, contact_id, recipient_email, template_key, category, campaign_id, flow_step_id, flow_run_id, workflow_run_id, workflow_node_id, subject, is_test)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [crypto.randomUUID(), contactId, normalizedTo, resolvedTemplateKey, resolvedCategory,
       campaignId ?? null, flowStepId ?? null, flowRunId ?? null, workflowRunId ?? null, workflowNodeId ?? null, subject, isTest === true],
    );
    deliveryId = Number(delivery.rows[0].id);
  } catch (error) {
    console.error("email delivery creation failed (non-fatal):", error);
  }

  if (!provider) {
    console.warn("No email provider configured (SES or Brevo), skipping email send.");
    await updateDelivery(deliveryId, "status = 'failed', failed_at = now(), last_error = $2", ["No email provider configured"]);
    await logEmailEvent({ deliveryId, templateKey: resolvedTemplateKey, category: resolvedCategory, recipientEmail: to, messageId: null, event: "failed", meta: { reason: "missing_api_key" } });
    return { ok: false, deliveryId };
  }

  if (!critical) {
    try {
      const suppressed = await pool.query("SELECT 1 FROM email_suppressions WHERE email = $1", [
        to.toLowerCase(),
      ]);
      if ((suppressed.rowCount ?? 0) > 0) {
        await logEmailEvent({
          deliveryId,
          templateKey: resolvedTemplateKey,
          category: resolvedCategory,
          recipientEmail: to,
          messageId: null,
          event: "skipped_suppressed",
        });
        await updateDelivery(deliveryId, "status = 'suppressed', failed_at = now(), last_error = $2", ["Address is suppressed"]);
        return { ok: true, skipped: "unsubscribed", deliveryId };
      }
    } catch (e) {
      // Never send marketing/automation mail when consent state cannot be
      // checked. Account-security messages use critical=true above.
      console.error("Suppression check failed, refusing non-critical send:", e);
      await updateDelivery(deliveryId, "status = 'failed', failed_at = now(), last_error = $2", ["Suppression check failed"]);
      return { ok: false, error: "suppression_check_failed", deliveryId };
    }
  }

  const unsubscribeToken = await createUnsubscribeToken(to);
  const unsubscribeUrl = `${SITE_URL}/unsubscribe?token=${unsubscribeToken}`;
  const oneClickUnsubscribeUrl = `${SITE_URL}/api/unsubscribe?token=${unsubscribeToken}`;

  let outgoingHtml = trackClicks === false ? html : await trackLinks(html, deliveryId);
  outgoingHtml = withFooter(outgoingHtml, unsubscribeUrl);
  if (trackOpens !== false) {
    const openToken = await createEmailOpenToken({
      deliveryId,
      email: to,
      templateKey: resolvedTemplateKey,
      category: resolvedCategory,
    });
    outgoingHtml += `<img src="${SITE_URL}/api/email/track/open?t=${openToken}" width="1" height="1" alt="" style="display:none;border:0;">`;
  }
  // Every email gets the same responsive, dark-mode-safe document shell --
  // applied here, once, so no call site (current or future) can forget it
  // or accidentally send an unstyled fragment.
  outgoingHtml = wrapEmailHtml(outgoingHtml, { serif: resolvedCategory === "campaign" });

  const sendOpts = {
    to,
    subject,
    html: outgoingHtml,
    from: sender,
    replyTo: replyTo || (await getReplyToEmail()),
    listUnsubscribe: oneClickUnsubscribeUrl,
    listUnsubscribePost: "List-Unsubscribe=One-Click",
    attachments,
  };
  const sendResult = provider === "brevo" ? await sendViaBrevo(sendOpts) : await sendViaSes(sendOpts);

  if (!sendResult.ok) {
    console.error(`${provider} send failed:`, sendResult.error);
    await logEmailEvent({
      deliveryId,
      templateKey: resolvedTemplateKey,
      category: resolvedCategory,
      recipientEmail: to,
      messageId: null,
      event: "failed",
      meta: { provider, error: sendResult.error },
    });
    await updateDelivery(deliveryId, "status = 'failed', failed_at = now(), last_error = $2", [
      `${provider} error: ${sendResult.error}`.slice(0, 500),
    ]);
    return { ok: false, deliveryId };
  }

  const messageId = sendResult.messageId;
  await logEmailEvent({
    deliveryId,
    templateKey: resolvedTemplateKey,
    category: resolvedCategory,
    recipientEmail: to,
    messageId,
    event: "sent",
    meta: { subject, provider },
  });
  await updateDelivery(
    deliveryId,
    "status = 'sent', sent_at = now(), provider_message_id = $2",
    [messageId],
  );
  if (deliveryId) {
    await pool.query(
      "UPDATE contacts SET last_emailed_at = now(), updated_at = now() WHERE id = (SELECT contact_id FROM email_deliveries WHERE id = $1)",
      [deliveryId],
    ).catch((error) => console.error("contact last_emailed_at update failed:", error));
  }

  return { ok: true, deliveryId };
}
