import { pool, withTransaction } from "@/lib/db";
import { buildSegmentPredicate } from "@/lib/contactSegments";
import { normalizePhoneForWhatsApp, sendWhatsAppTemplateMessage } from "@/lib/whatsapp";
import { getWhatsAppVariableMappings, resolveWhatsAppVariableMappings } from "@/lib/whatsappVariableMappings";
import { buildSendComponents, MEDIA_PARAM_TYPE, type MediaFormat } from "@/lib/whatsappTemplates";

/** One approved template, sent to a consent-filtered segment.
 *
 * Deliberately built on the same bones as the email campaigns in
 * campaigns.ts: a row per recipient, claimed with SKIP LOCKED, a first
 * batch sent on click and the rest finished by the five-minute dispatcher.
 * Two WhatsApp-specific rules on top of that:
 *
 * - Every campaign requires an explicit `subscribed`, whatever the
 *   template's Meta category. A utility template is a service message when
 *   it follows something the person just did; the same template sent to a
 *   filtered list of hundreds is marketing in everything but name, and
 *   WhatsApp scores the sending number on how many people block it.
 * - Consent is re-checked at send time, not only when the list is built. A
 *   campaign to a few thousand people takes hours to drain, and a STOP that
 *   arrives in the middle of it has to stop the rest. */

export type CampaignStatus = "draft" | "sending" | "sent" | "completed_with_errors";

export type WhatsAppCampaign = {
  id: number;
  name: string;
  template_name: string;
  language: string;
  category: string | null;
  variables: string[];
  header_media_url: string | null;
  header_media_format: MediaFormat | null;
  button_url_param: string | null;
  button_url_index: number | null;
  segment_id: number | null;
  status: CampaignStatus;
  created_at: string;
  sent_at: string | null;
  finished_at: string | null;
  last_error: string | null;
};

/** Per-recipient values accepted in a campaign variable field. */
export const CAMPAIGN_TOKENS: Record<string, string> = {
  "[first_name]": "Their first name",
  "[name]": "Their full name",
  "[email]": "Their email address",
};

export function fillCampaignVariable(
  value: string,
  contact: { name: string | null; email: string | null; phone: string | null },
): string {
  const full = (contact.name || "").trim();
  const values = {
    first_name: full.split(/\s+/)[0] || "there",
    name: full || "there",
    email: contact.email || "",
    phone: contact.phone || "",
  };
  return value.replace(/\[(first_name|name|email|phone)\]/g, (_match, key: keyof typeof values) => values[key]);
}

/** Who a campaign would go to. Used both by the queue step and by the
 * count shown before sending, so the number on screen is the number of
 * messages that will actually be sent. */
function audienceSql(predicateSql: string): string {
  return `FROM contacts c
     WHERE ${predicateSql}
       AND c.phone IS NOT NULL AND c.phone <> ''
       AND c.whatsapp_status = 'subscribed'`;
}

export async function countCampaignAudience(rules: unknown): Promise<number> {
  const predicate = buildSegmentPredicate(rules);
  const result = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count ${audienceSql(predicate.sql)}`,
    predicate.values,
  );
  return result.rows[0]?.count || 0;
}

export async function queueCampaignRecipients(campaignId: number): Promise<number> {
  return withTransaction(async (client) => {
    const campaignResult = await client.query<{ id: number; rules: unknown }>(
      `SELECT c.id, s.rules
       FROM whatsapp_campaigns c
       LEFT JOIN contact_segments s ON s.id = c.segment_id
       WHERE c.id = $1 AND c.status = 'draft'
       FOR UPDATE OF c`,
      [campaignId],
    );
    const campaign = campaignResult.rows[0];
    if (!campaign) throw new Error("campaign_not_draft");

    const predicate = buildSegmentPredicate(campaign.rules || { match: "all", rules: [] }, 2);
    const inserted = await client.query(
      `INSERT INTO whatsapp_campaign_sends (campaign_id, contact_id, phone, status)
       SELECT $1, c.id, c.phone, 'pending'
       ${audienceSql(predicate.sql)}
       ON CONFLICT (campaign_id, contact_id) DO NOTHING`,
      [campaignId, ...predicate.values],
    );

    await client.query(
      `UPDATE whatsapp_campaigns
       SET status = CASE WHEN $2 = 0 THEN 'sent' ELSE 'sending' END,
           sent_at = CASE WHEN $2 = 0 THEN now() ELSE sent_at END,
           finished_at = CASE WHEN $2 = 0 THEN now() ELSE NULL END,
           last_error = NULL
       WHERE id = $1`,
      [campaignId, inserted.rowCount ?? 0],
    );
    return inserted.rowCount ?? 0;
  });
}

type ClaimedSend = {
  id: number;
  attempts: number;
  contact_id: number;
  phone: string;
  campaign_id: number;
  template_name: string;
  language: string;
  variables: string[];
  header_media_url: string | null;
  header_media_format: MediaFormat | null;
  button_url_param: string | null;
  button_url_index: number | null;
  name: string | null;
  email: string | null;
  whatsapp_status: string;
};

export async function sendPendingCampaignBatch(
  limit = 25,
  campaignId?: number,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const claimed = await withTransaction((client) =>
    client.query<ClaimedSend>(
      `WITH candidates AS (
        SELECT s.id
        FROM whatsapp_campaign_sends s
        WHERE s.status = 'pending'
          AND ($2::integer IS NULL OR s.campaign_id = $2)
          AND (s.claimed_at IS NULL OR s.claimed_at < now() - interval '15 minutes')
        ORDER BY s.id
        FOR UPDATE OF s SKIP LOCKED
        LIMIT $1
      ), upd AS (
        UPDATE whatsapp_campaign_sends s
        SET claimed_at = now(), attempts = attempts + 1
        FROM candidates
        WHERE s.id = candidates.id
        RETURNING s.*
      )
      SELECT upd.id, upd.attempts, upd.contact_id, upd.phone,
             c.id AS campaign_id, c.template_name, c.language, c.variables,
             c.header_media_url, c.header_media_format, c.button_url_param, c.button_url_index,
             ct.name, ct.email, ct.whatsapp_status
      FROM upd
      JOIN whatsapp_campaigns c ON c.id = upd.campaign_id
      JOIN contacts ct ON ct.id = upd.contact_id`,
      [limit, campaignId ?? null],
    ),
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of claimed.rows) {
    // Re-checked here, not just at queue time: a STOP that arrives while a
    // long campaign is still draining has to stop the remainder of it.
    if (row.whatsapp_status !== "subscribed") {
      await pool.query(
        `UPDATE whatsapp_campaign_sends SET status = 'skipped', claimed_at = NULL,
           skipped_reason = $2 WHERE id = $1`,
        [row.id, row.whatsapp_status === "unsubscribed" ? "Opted out of WhatsApp" : "No WhatsApp consent"],
      );
      skipped++;
      continue;
    }

    const to = normalizePhoneForWhatsApp(row.phone);
    if (to.length < 8) {
      await pool.query(
        `UPDATE whatsapp_campaign_sends SET status = 'skipped', claimed_at = NULL,
           skipped_reason = 'Phone number is not usable' WHERE id = $1`,
        [row.id],
      );
      skipped++;
      continue;
    }

    let variables: string[];
    try {
      const mappings = await getWhatsAppVariableMappings(row.template_name);
      variables = mappings.length
        ? await resolveWhatsAppVariableMappings(row.template_name, row.contact_id)
        : (row.variables || []).map((value) => fillCampaignVariable(String(value ?? ""), { name: row.name, email: row.email, phone: row.phone }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not fill this template from contact activity.";
      await pool.query(
        `UPDATE whatsapp_campaign_sends SET status = 'failed', claimed_at = NULL, last_error = $2 WHERE id = $1`,
        [row.id, message.slice(0, 1000)],
      );
      failed++;
      continue;
    }
    const components = buildSendComponents({
      variables,
      media:
        row.header_media_url && row.header_media_format
          ? { type: MEDIA_PARAM_TYPE[row.header_media_format], link: row.header_media_url }
          : null,
      urlButton: row.button_url_param ? { index: row.button_url_index ?? 0, value: row.button_url_param } : null,
    });

    const result = await sendWhatsAppTemplateMessage(to, row.template_name, row.language, components, {
      campaignId: row.campaign_id,
    }).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));

    if (result.ok) {
      await pool.query(
        `UPDATE whatsapp_campaign_sends SET status = 'sent', sent_at = now(), claimed_at = NULL,
           wa_message_id = $2, last_error = NULL WHERE id = $1`,
        [row.id, result.waMessageId],
      );
      sent++;
    } else {
      // Three attempts, then it stays failed: a rejected template or an
      // unreachable number fails identically every time, and retrying a
      // whole list of those is how a sending number gets its quality
      // rating cut.
      await pool.query(
        `UPDATE whatsapp_campaign_sends
         SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
             claimed_at = NULL, last_error = $2
         WHERE id = $1`,
        [row.id, result.error.slice(0, 500)],
      );
      failed++;
    }
  }

  // Close out any campaign with nothing left pending. Written as one
  // statement over every 'sending' campaign so a crashed batch cannot
  // leave a finished campaign stuck on "sending" forever.
  await pool.query(`
    UPDATE whatsapp_campaigns c
    SET status = CASE
          WHEN EXISTS (SELECT 1 FROM whatsapp_campaign_sends s WHERE s.campaign_id = c.id AND s.status = 'failed')
            THEN 'completed_with_errors'
          ELSE 'sent'
        END,
        sent_at = COALESCE(sent_at, now()), finished_at = now(),
        last_error = CASE
          WHEN EXISTS (SELECT 1 FROM whatsapp_campaign_sends s WHERE s.campaign_id = c.id AND s.status = 'failed')
            THEN 'One or more recipients could not be messaged. Open the campaign to see why.'
          ELSE NULL
        END
    WHERE c.status = 'sending'
      AND NOT EXISTS (SELECT 1 FROM whatsapp_campaign_sends s WHERE s.campaign_id = c.id AND s.status = 'pending')
  `);

  return { sent, skipped, failed };
}

export type CampaignProgress = {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  delivered: number;
  read: number;
};

/** A campaign's result. Sent/failed/skipped come from our own send rows;
 * delivered and read come from Meta's status webhooks, matched back by the
 * message id we recorded when sending. */
export async function campaignProgress(campaignId: number): Promise<CampaignProgress> {
  const result = await pool.query<CampaignProgress>(
    `SELECT
       count(*) FILTER (WHERE s.status = 'pending')::int AS pending,
       count(*) FILTER (WHERE s.status = 'sent')::int AS sent,
       count(*) FILTER (WHERE s.status = 'failed')::int AS failed,
       count(*) FILTER (WHERE s.status = 'skipped')::int AS skipped,
       count(*) FILTER (WHERE m.status IN ('delivered', 'read'))::int AS delivered,
       count(*) FILTER (WHERE m.status = 'read')::int AS read
     FROM whatsapp_campaign_sends s
     LEFT JOIN whatsapp_messages m
       ON m.wa_message_id = s.wa_message_id AND m.direction = 'outbound'
     WHERE s.campaign_id = $1`,
    [campaignId],
  );
  return (
    result.rows[0] || { pending: 0, sent: 0, failed: 0, skipped: 0, delivered: 0, read: 0 }
  );
}
