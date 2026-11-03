import { pool, withTransaction } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export async function dispatchScheduledContactEmails(limit = 25) {
  const claimed = await withTransaction((client) => client.query(
    `WITH candidates AS (
       SELECT id FROM contact_email_scheduled
       WHERE scheduled_at <= now()
         AND (status = 'pending' OR (status = 'sending' AND claimed_at < now() - interval '15 minutes'))
       ORDER BY scheduled_at
       FOR UPDATE SKIP LOCKED LIMIT $1
     )
     UPDATE contact_email_scheduled s
     SET status = 'sending', claimed_at = now(), attempts = attempts + 1
     FROM candidates WHERE s.id = candidates.id
     RETURNING s.*`,
    [limit],
  ));

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of claimed.rows) {
    try {
      const contact = row.contact_id ? await pool.query(
        `SELECT c.marketing_status, c.deliverability_status,
           lower(trim(c.email)) = lower(trim($2)) AS recipient_unchanged,
           EXISTS (SELECT 1 FROM email_suppressions e WHERE lower(trim(e.email)) = lower(trim($2))) AS suppressed
         FROM contacts c WHERE c.id = $1`,
        [row.contact_id, row.recipient_email],
      ) : { rows: [] };
      const current = contact.rows[0];
      if (!current || !current.recipient_unchanged || current.marketing_status === "unsubscribed" || current.deliverability_status !== "ok" || current.suppressed) {
        await pool.query(
          `UPDATE contact_email_scheduled SET status = 'skipped', claimed_at = NULL,
             last_error = $2 WHERE id = $1`,
          [row.id, !current ? "Contact no longer exists" : !current.recipient_unchanged ? "Contact email changed after scheduling" : "Contact is suppressed, unsubscribed, or undeliverable"],
        );
        skipped++;
        continue;
      }

      const result = await sendEmail({
        to: row.recipient_email,
        subject: row.subject,
        html: row.html,
        from: row.from_email,
        replyTo: row.reply_to || undefined,
        category: "system",
        trackOpens: false,
      });
      if (!result.ok) throw new Error("Email provider rejected send");
      await pool.query(
        `UPDATE contact_email_scheduled SET status = $2, sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE NULL END,
           claimed_at = NULL, email_delivery_id = $3 WHERE id = $1`,
        [row.id, result.skipped ? "skipped" : "sent", result.deliveryId],
      );
      if (result.skipped) skipped++;
      else sent++;
    } catch (error) {
      await pool.query(
        `UPDATE contact_email_scheduled
         SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
             claimed_at = NULL, last_error = $2 WHERE id = $1`,
        [row.id, error instanceof Error ? error.message.slice(0, 500) : "Unknown scheduled email failure"],
      );
      failed++;
    }
  }
  return { checked: claimed.rows.length, sent, skipped, failed };
}
