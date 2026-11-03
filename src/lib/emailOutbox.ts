import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { raiseAlert } from "@/lib/systemAlerts";

type SendArgs = Parameters<typeof sendEmail>[0];

// Minutes to wait before retry n (attempt 2 waits 5, attempt 3 waits 15...).
// Six attempts span roughly 10 hours, enough to ride out an SES hiccup.
const BACKOFF_MINUTES = [5, 15, 60, 180, 360];
const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;

/** For emails someone is owed (course access, receipts, owner alerts): sends
 * now, and if that fails, queues it for the email-dispatch cron to retry.
 * Never throws, so a mail outage can't fail the payment or grant that
 * triggered it. */
export async function sendEmailWithRetry(args: SendArgs): Promise<{ ok: boolean; queued?: boolean }> {
  let error = "";
  try {
    const result = await sendEmail(args);
    if (result.ok) return { ok: true };
    error = ("error" in result && typeof result.error === "string" && result.error) || "Email provider rejected send";
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown send failure";
  }

  try {
    await pool.query(
      `INSERT INTO email_outbox (recipient_email, subject, payload, last_error) VALUES ($1, $2, $3, $4)`,
      [args.to.trim().toLowerCase(), args.subject, JSON.stringify(args), error.slice(0, 500)],
    );
    return { ok: false, queued: true };
  } catch (queueError) {
    console.error("Could not queue failed email for retry:", queueError);
    await raiseAlert({
      kind: "outbox_failed",
      dedupeKey: `outbox_unqueued:${args.to}:${args.subject}:${new Date().toISOString().slice(0, 13)}`,
      severity: "critical",
      title: `Email to ${args.to} failed and could not be queued for retry`,
      detail: `Subject: ${args.subject}. Error: ${error}`,
    });
    return { ok: false };
  }
}

/** Called by the email-dispatch cron. Claims due rows with a lease so two
 * overlapping runs never send the same email twice. */
export async function retryEmailOutbox(limit = 20): Promise<{ sent: number; failed: number; retrying: number }> {
  const due = await pool.query<{ id: number; payload: SendArgs; attempts: number; recipient_email: string; subject: string }>(
    `UPDATE email_outbox o SET next_attempt_at = now() + interval '15 minutes'
     WHERE o.id IN (
       SELECT id FROM email_outbox WHERE status = 'pending' AND next_attempt_at <= now()
       ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT $1
     )
     RETURNING o.id, o.payload, o.attempts, o.recipient_email, o.subject`,
    [limit],
  );

  let sent = 0, failed = 0, retrying = 0;
  for (const row of due.rows) {
    let error = "";
    try {
      const result = await sendEmail(row.payload);
      if (result.ok) {
        await pool.query("UPDATE email_outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1 WHERE id = $1", [row.id]);
        sent++;
        continue;
      }
      error = ("error" in result && typeof result.error === "string" && result.error) || "Email provider rejected send";
    } catch (e) {
      error = e instanceof Error ? e.message : "Unknown send failure";
    }

    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await pool.query("UPDATE email_outbox SET status = 'failed', attempts = $2, last_error = $3 WHERE id = $1", [row.id, attempts, error.slice(0, 500)]);
      await raiseAlert({
        kind: "outbox_failed",
        dedupeKey: `outbox_failed:${row.id}`,
        severity: "critical",
        title: `Email to ${row.recipient_email} could not be sent after ${attempts} tries`,
        detail: `Subject: ${row.subject}. Last error: ${error}. Reply to them yourself so they aren't left waiting.`,
        link: "/console/attention",
      });
      failed++;
    } else {
      await pool.query(
        `UPDATE email_outbox SET attempts = $2, last_error = $3, next_attempt_at = now() + make_interval(mins => $4) WHERE id = $1`,
        [row.id, attempts, error.slice(0, 500), BACKOFF_MINUTES[attempts - 1]],
      );
      retrying++;
    }
  }
  return { sent, failed, retrying };
}
