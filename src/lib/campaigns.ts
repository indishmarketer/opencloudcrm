import { pool, withTransaction } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { buildSegmentPredicate } from "@/lib/contactSegments";
import { applyMessageVariables, contactMessageValues } from "@/lib/messageVariables";

export async function queueCampaignRecipients(campaignId: number): Promise<number> {
  return withTransaction(async (client) => {
    const campaignResult = await client.query(
      `SELECT c.id, c.segment_id, s.rules
       FROM newsletter_campaigns c
       LEFT JOIN contact_segments s ON s.id = c.segment_id
       WHERE c.id = $1 AND (c.status = 'draft' OR (c.status = 'scheduled' AND c.scheduled_at <= now()))
       FOR UPDATE OF c`,
      [campaignId],
    );
    const campaign = campaignResult.rows[0];
    if (!campaign) throw new Error("campaign_not_draft");

    const predicate = buildSegmentPredicate(campaign.rules || { match: "all", rules: [] }, 2);
    const inserted = await client.query(
      `INSERT INTO newsletter_sends (campaign_id, subscriber_id, contact_id, status)
       SELECT $1, ns.id, c.id, 'pending'
       FROM contacts c
       LEFT JOIN newsletter_subscribers ns ON lower(trim(ns.email)) = c.normalized_email
       WHERE ${predicate.sql}
         AND c.marketing_status = 'subscribed'
         AND c.deliverability_status = 'ok'
         AND NOT EXISTS (
           SELECT 1 FROM email_suppressions es WHERE lower(trim(es.email)) = c.normalized_email
         )
       ON CONFLICT (campaign_id, contact_id) WHERE contact_id IS NOT NULL DO NOTHING`,
      [campaignId, ...predicate.values],
    );

    await client.query(
      `UPDATE newsletter_campaigns
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

export async function ensureCampaignBehaviorSegments(campaignId: number, subject: string): Promise<void> {
  const definitions = [
    { suffix: "opened", description: `People who opened campaign #${campaignId}: ${subject}`, field: "campaign_opened" },
    { suffix: "not opened after 48h", description: `People who did not open campaign #${campaignId} after 48 hours: ${subject}`, field: "campaign_not_opened" },
    { suffix: "clicked", description: `People who clicked campaign #${campaignId}: ${subject}`, field: "campaign_clicked" },
  ];
  for (const item of definitions) {
    const name = `Campaign #${campaignId} — ${item.suffix}`;
    await pool.query(
      `INSERT INTO contact_segments (name, description, rules, is_system)
       SELECT $1, $2, $3, true WHERE NOT EXISTS (SELECT 1 FROM contact_segments WHERE lower(name) = lower($1))`,
      [name, item.description.slice(0, 500), JSON.stringify({ match: "all", rules: [
        { field: "marketing_status", operator: "equals", value: "subscribed" },
        { field: item.field, operator: "equals", value: String(campaignId) },
      ] })],
    );
  }
}

/** Freeze recipients for campaigns whose IST schedule has come due. Sending
 * itself is handled by sendPendingCampaignBatch, shared with manual sends. */
export async function queueDueCampaigns(limit = 10): Promise<number> {
  const due = await pool.query(
    `SELECT id, subject FROM newsletter_campaigns
     WHERE status = 'scheduled' AND scheduled_at <= now()
     ORDER BY scheduled_at LIMIT $1`,
    [limit],
  );
  for (const campaign of due.rows) {
    try {
      await ensureCampaignBehaviorSegments(Number(campaign.id), campaign.subject);
      await queueCampaignRecipients(Number(campaign.id));
    } catch (error) {
      if (error instanceof Error && error.message === "campaign_not_draft") continue;
      console.error(`Could not queue scheduled campaign ${campaign.id}:`, error);
      await pool.query(
        `UPDATE newsletter_campaigns SET last_error = $2
         WHERE id = $1 AND status = 'scheduled'`,
        [campaign.id, error instanceof Error ? error.message.slice(0, 500) : "Could not queue campaign"],
      );
    }
  }
  return due.rowCount ?? 0;
}

export async function sendPendingCampaignBatch(
  limit = 50,
  campaignId?: number,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const claimed = await withTransaction((client) =>
    client.query(
      `WITH candidates AS (
        SELECT s.id
        FROM newsletter_sends s
        WHERE s.status = 'pending'
          AND ($2::integer IS NULL OR s.campaign_id = $2)
          AND (s.claimed_at IS NULL OR s.claimed_at < now() - interval '15 minutes')
        ORDER BY s.id
        FOR UPDATE OF s SKIP LOCKED
        LIMIT $1
      ), upd AS (
        UPDATE newsletter_sends s
        SET claimed_at = now(), attempts = attempts + 1
        FROM candidates
        WHERE s.id = candidates.id
        RETURNING s.*
      )
      SELECT upd.id, upd.attempts, upd.contact_id, c.id AS campaign_id,
             c.subject, c.html, c.from_email, ct.name, ct.email, ct.phone
      FROM upd
      JOIN newsletter_campaigns c ON c.id = upd.campaign_id
      JOIN contacts ct ON ct.id = upd.contact_id`,
      [limit, campaignId ?? null],
    )
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of claimed.rows) {
    try {
      const result = await sendEmail({
        to: row.email,
        subject: applyMessageVariables(row.subject, contactMessageValues(row)),
        html: applyMessageVariables(row.html, contactMessageValues(row)),
        from: row.from_email,
        templateKey: `campaign:${row.campaign_id}`,
        category: "campaign",
        campaignId: row.campaign_id,
      });
      if (!result.ok) throw new Error("Email provider rejected send");
      if (result.skipped) {
        await pool.query(
          `UPDATE newsletter_sends SET status = 'skipped', claimed_at = NULL,
             skipped_reason = $2, email_delivery_id = $3 WHERE id = $1`,
          [row.id, result.skipped, result.deliveryId],
        );
        skipped++;
      } else {
        await pool.query(
          `UPDATE newsletter_sends SET status = 'sent', sent_at = now(), claimed_at = NULL,
             email_delivery_id = $2 WHERE id = $1`,
          [row.id, result.deliveryId],
        );
        sent++;
      }
    } catch (error) {
      await pool.query(
        `UPDATE newsletter_sends
         SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
             claimed_at = NULL, last_error = $2
         WHERE id = $1`,
        [row.id, error instanceof Error ? error.message.slice(0, 500) : "Unknown send failure"],
      );
      failed++;
    }
  }

  await pool.query(`
    UPDATE newsletter_campaigns c
    SET status = CASE
          WHEN EXISTS (SELECT 1 FROM newsletter_sends s WHERE s.campaign_id = c.id AND s.status = 'failed')
            THEN 'completed_with_errors'
          ELSE 'sent'
        END,
        sent_at = COALESCE(sent_at, now()), finished_at = now(),
        last_error = CASE
          WHEN EXISTS (SELECT 1 FROM newsletter_sends s WHERE s.campaign_id = c.id AND s.status = 'failed')
            THEN 'One or more recipients failed after five attempts.'
          ELSE NULL
        END
    WHERE c.status = 'sending'
      AND NOT EXISTS (SELECT 1 FROM newsletter_sends s WHERE s.campaign_id = c.id AND s.status = 'pending')
  `);

  return { sent, skipped, failed };
}
