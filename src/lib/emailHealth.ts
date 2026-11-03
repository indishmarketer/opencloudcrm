import { pool } from "@/lib/db";
import { getSesAccountHealth } from "@/lib/sesEmail";
import { raiseAlert } from "@/lib/systemAlerts";

// SES puts accounts under review at a 5% bounce rate or a 0.1% complaint
// rate. Warn well before either.
const BOUNCE_WARN = 0.03;
const BOUNCE_URGENT = 0.05;
const MIN_SENDS_FOR_RATE = 40;

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Hourly email health check, run from the email-dispatch cron. */
export async function checkEmailHealth(): Promise<void> {
  // Every spam complaint matters at this volume: one in a few hundred
  // sends is already over SES's limit.
  const complaints = await pool.query<{ id: number; recipient_email: string; subject: string }>(
    `SELECT id, recipient_email, subject FROM email_deliveries
     WHERE status = 'complained' AND NOT is_test AND created_at > now() - interval '30 days'`,
  );
  for (const row of complaints.rows) {
    await raiseAlert({
      kind: "email_complaint",
      dedupeKey: `email_complaint:${row.id}`,
      title: `${row.recipient_email} marked an email as spam`,
      detail: `Subject: ${row.subject}. They are no longer emailed. If several people do this, look at what was sent and to whom.`,
      link: "/console/email/analytics?tab=problems",
    });
  }

  const rate = await pool.query<{ sent: number; bounced: number }>(
    `SELECT count(*) FILTER (WHERE status IN ('sent', 'delivered', 'bounced', 'complained'))::int AS sent,
            count(*) FILTER (WHERE status = 'bounced')::int AS bounced
     FROM email_deliveries WHERE NOT is_test AND created_at > now() - interval '7 days'`,
  );
  const { sent, bounced } = rate.rows[0] || { sent: 0, bounced: 0 };
  if (sent >= MIN_SENDS_FOR_RATE && bounced / sent >= BOUNCE_WARN) {
    const pct = ((bounced / sent) * 100).toFixed(1);
    await raiseAlert({
      kind: "email_bounce_rate",
      dedupeKey: `email_bounce_rate:${today()}`,
      severity: bounced / sent >= BOUNCE_URGENT ? "critical" : "warning",
      title: `Bounce rate is ${pct}% over the last 7 days (${bounced} of ${sent})`,
      detail: "Amazon SES reviews accounts at 5%. Stop sending to old or imported lists and check the Problems tab for the bad addresses.",
      link: "/console/email/analytics?tab=problems",
    });
  }

  const account = await getSesAccountHealth();
  if (account.ok) {
    if (account.enforcementStatus !== "HEALTHY" || !account.sendingEnabled) {
      await raiseAlert({
        kind: "ses_account",
        dedupeKey: `ses_account:${account.enforcementStatus}:${account.sendingEnabled}:${today()}`,
        severity: "critical",
        title: account.sendingEnabled
          ? `Amazon SES account status is ${account.enforcementStatus}`
          : "Amazon SES has paused sending for this account",
        detail: "Open Amazon SES > Reputation metrics in the AWS console to see why and what AWS asks for.",
      });
    }
    if (account.max24h > 0 && account.sentLast24h / account.max24h >= 0.8) {
      await raiseAlert({
        kind: "ses_quota",
        dedupeKey: `ses_quota:${today()}`,
        title: `Used ${account.sentLast24h} of ${account.max24h} Amazon SES daily sends`,
        detail: "Sends beyond the quota fail until it resets. Request a higher quota in the SES console if this keeps happening.",
      });
    }
  }
}
