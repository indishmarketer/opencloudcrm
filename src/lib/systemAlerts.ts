import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL, SITE_HOSTNAME, emailAt } from "@/lib/liveSiteUrl";

export type AlertSeverity = "info" | "warning" | "critical";

/** Records something the owner needs to look at. `dedupeKey` makes it
 * idempotent: raising the same problem twice keeps one row. Listed at
 * /console/attention and emailed by emailPendingAlerts(). Never throws. */
export async function raiseAlert(alert: {
  kind: string;
  dedupeKey: string;
  title: string;
  detail?: string;
  link?: string;
  severity?: AlertSeverity;
  /** false skips the email digest for this one -- for events that happen
   * often and aren't individually urgent (an inbound WhatsApp message, one
   * per sender per day), where emailing every single one runs up real SES
   * cost at any volume and the console's Needs Attention badge already
   * covers it. Still shows up in the console exactly as normal; only the
   * email is skipped. Defaults to true. */
  notifyEmail?: boolean;
}): Promise<boolean> {
  try {
    const result = await pool.query(
      `INSERT INTO system_alerts (kind, dedupe_key, severity, title, detail, link, emailed_at)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN NULL ELSE now() END)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [alert.kind, alert.dedupeKey.slice(0, 300), alert.severity || "warning", alert.title.slice(0, 300),
       alert.detail?.slice(0, 2000) || null, alert.link || null, alert.notifyEmail !== false],
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error("raiseAlert failed:", error);
    return false;
  }
}

/**
 * Something arrived that the owner has to act on: a tool submitted, a
 * review written, somebody applying to write. Distinct from `raiseAlert`
 * only in intent, and in defaulting to `info` severity, because none of
 * these are failures.
 *
 * This exists because the console gave no sign that anything had come in.
 * The only signal was an email, so the answer to "has anyone submitted a
 * tool?" was to go and search your inbox. Now the console itself carries
 * the count.
 *
 * Never throws and never blocks the thing that triggered it. A submission
 * that succeeds must not fail because we could not write a notification,
 * so every caller fires this without awaiting the result.
 */
export async function raiseInboxAlert(alert: {
  kind: string;
  /** Must be unique per event, normally `${kind}:${row id}`. Reusing a key
   * silently drops the notification, which is the correct behaviour for a
   * retried webhook and the wrong one for a second genuine submission. */
  dedupeKey: string;
  title: string;
  detail?: string;
  link?: string;
  severity?: AlertSeverity;
  notifyEmail?: boolean;
}): Promise<void> {
  // Console-only by default: this is routine activity (a tool submitted, a
  // post drafted, a message arrived), not a problem. The "Needs Attention"
  // badge already surfaces it; emailing every one of these would mean an
  // email for everything, which is what raiseAlert's email digest is for
  // actual problems, not FYIs. A caller can still pass notifyEmail: true
  // for an inbox event that genuinely warrants an email.
  await raiseAlert({ severity: "info", notifyEmail: false, ...alert });
}

/** Turns failures already recorded elsewhere into alerts. Safe to run on
 * every cron tick: dedupe keys include the failure count, so an alert is
 * only raised again when something new fails. */
export async function sweepFailureAlerts(): Promise<void> {
  const flows = await pool.query<{ id: number; name: string; failed: number }>(
    `SELECT f.id, f.name, count(*)::int AS failed
     FROM email_flow_scheduled s
     JOIN email_flow_steps st ON st.id = s.step_id
     JOIN email_flows f ON f.id = st.flow_id
     WHERE s.status = 'failed'
     GROUP BY f.id, f.name`,
  );
  for (const flow of flows.rows) {
    await raiseAlert({
      kind: "automation_failed",
      dedupeKey: `automation_failed:${flow.id}:${flow.failed}`,
      title: `Automation "${flow.name}" has ${flow.failed} email${flow.failed === 1 ? "" : "s"} that failed after 5 tries`,
      detail: "These people did not get that step. Check the email address and the step content, then resend if needed.",
      link: `/console/email/automation/${flow.id}`,
    });
  }

  const campaigns = await pool.query<{ id: number; subject: string; failed: number }>(
    `SELECT c.id, c.subject, count(s.id)::int AS failed
     FROM newsletter_campaigns c JOIN newsletter_sends s ON s.campaign_id = c.id AND s.status = 'failed'
     GROUP BY c.id, c.subject`,
  );
  for (const campaign of campaigns.rows) {
    await raiseAlert({
      kind: "campaign_failed",
      dedupeKey: `campaign_failed:${campaign.id}:${campaign.failed}`,
      title: `Campaign "${campaign.subject}" failed for ${campaign.failed} recipient${campaign.failed === 1 ? "" : "s"}`,
      detail: "They were retried 5 times and did not go out.",
      link: `/console/email/campaigns/${campaign.id}`,
    });
  }
}

/** Emails the owner one digest of alerts not yet emailed. If the send
 * fails (for example SES is paused), they stay queued for the next run and
 * remain visible in the console either way. */
export async function emailPendingAlerts(): Promise<number> {
  const to = process.env.ADMIN_EMAIL;
  if (!to) return 0;
  const pending = await pool.query<{ id: number; severity: AlertSeverity; title: string; detail: string | null; link: string | null }>(
    `SELECT id, severity, title, detail, link FROM system_alerts
     WHERE emailed_at IS NULL AND resolved_at IS NULL
     ORDER BY created_at LIMIT 50`,
  );
  if (pending.rows.length === 0) return 0;

  const critical = pending.rows.some((a) => a.severity === "critical");
  const items = pending.rows
    .map((a) => {
      const href = a.link?.startsWith("/") ? `${SITE_URL}${a.link}` : null;
      return `<li style="margin-bottom:12px"><strong>${escapeHtml(a.title)}</strong>` +
        (a.detail ? `<br>${escapeHtml(a.detail)}` : "") +
        (href ? `<br><a href="${escapeHtml(href)}">Open in console</a>` : "") +
        `</li>`;
    })
    .join("");
  const html =
    `<p>${pending.rows.length === 1 ? "Something needs" : `${pending.rows.length} things need`} your attention on ${SITE_HOSTNAME}:</p>` +
    `<ul>${items}</ul>` +
    `<p><a href="${SITE_URL}/console/attention">See everything that needs attention</a></p>`;

  const result = await sendEmail({
    to,
    subject: `${critical ? "Urgent: " : ""}${pending.rows.length === 1 ? pending.rows[0].title : `${pending.rows.length} things need attention`}`.slice(0, 200),
    html,
    from: emailAt("support"),
    critical: true,
    category: "system",
    trackOpens: false,
    trackClicks: false,
  }).catch((error) => {
    console.error("Alert digest send failed:", error);
    return { ok: false };
  });
  if (!result.ok) return 0;

  await pool.query("UPDATE system_alerts SET emailed_at = now() WHERE id = ANY($1::bigint[])", [pending.rows.map((a) => a.id)]);
  return pending.rows.length;
}
