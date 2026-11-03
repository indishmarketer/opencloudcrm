import { pool, withTransaction } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { applyVars, automationGoalReached } from "@/lib/emailAutomation";
import { queueDueCampaigns, sendPendingCampaignBatch } from "@/lib/campaigns";
import { createNotification } from "@/lib/notifications";
import { queueGoogleReviewRequest, dispatchDueReviewRequests } from "@/lib/reviewRequests";
import { reconcileGoogleReviewsIfDue } from "@/lib/googleBusiness";
import { retryEmailOutbox } from "@/lib/emailOutbox";
import { sweepFailureAlerts, emailPendingAlerts } from "@/lib/systemAlerts";
import { checkEmailHealth } from "@/lib/emailHealth";
import { contactMessageValues } from "@/lib/messageVariables";
import { dispatchScheduledContactEmails } from "@/lib/scheduledContactEmails";

export async function dispatchDueEmailWork() {
  const due = await withTransaction((client) => client.query(`
    WITH candidates AS (
      SELECT s.id
      FROM email_flow_scheduled s
      JOIN email_flow_steps st ON st.id = s.step_id
      JOIN email_flows f ON f.id = st.flow_id
      LEFT JOIN email_flow_runs r ON r.id = s.run_id
      WHERE s.status = 'pending' AND s.send_at <= now() AND st.archived_at IS NULL AND f.active = true AND f.archived_at IS NULL
        AND (r.id IS NULL OR r.status = 'active')
        AND (s.claimed_at IS NULL OR s.claimed_at < now() - interval '15 minutes')
      ORDER BY s.send_at
      FOR UPDATE OF s SKIP LOCKED
      LIMIT 25
    ), claimed AS (
      UPDATE email_flow_scheduled s SET claimed_at = now(), attempts = attempts + 1
      FROM candidates WHERE s.id = candidates.id RETURNING s.*
    )
    SELECT s.id, s.recipient_email, s.vars, s.attempts,
           st.id AS step_id, st.subject, st.body_html, st.from_email, st.action_type, st.review_template_key,
           st.condition_type, st.condition_step_id,
           f.id AS flow_id, f.trigger_key, f.purpose, f.goal_type, f.course_id,
           s.run_id, u.id AS user_id, co.id AS contact_id,
           c.slug AS course_slug, c.title AS course_title,
           co.name, co.email, co.phone
    FROM claimed s
    JOIN email_flow_steps st ON st.id = s.step_id
    JOIN email_flows f ON f.id = st.flow_id
    LEFT JOIN users u ON lower(u.email) = lower(s.recipient_email)
    LEFT JOIN contacts co ON co.normalized_email = lower(trim(s.recipient_email))
    LEFT JOIN courses c ON c.id = f.course_id
  `));

  let sent = 0;
  let skipped = 0;
  let nudged = 0;
  for (const row of due.rows) {
    try {
      if (row.run_id && await automationGoalReached(row.goal_type, row.recipient_email, row.course_id)) {
        await pool.query(
          `UPDATE email_flow_scheduled SET status = 'skipped', claimed_at = NULL, skipped_reason = 'Flow goal reached'
           WHERE run_id = $1 AND status = 'pending'`,
          [row.run_id],
        );
        await pool.query(
          `UPDATE email_flow_runs SET status = 'exited', exit_reason = $2, finished_at = now()
           WHERE id = $1 AND status = 'active'`,
          [row.run_id, row.goal_type],
        );
        skipped++;
        continue;
      }

      if (row.purpose === "marketing") {
        const consent = await pool.query(
          `SELECT 1 FROM contacts c WHERE c.normalized_email = lower(trim($1))
             AND c.marketing_status = 'subscribed' AND c.deliverability_status = 'ok'
             AND NOT EXISTS (SELECT 1 FROM email_suppressions es WHERE lower(trim(es.email)) = c.normalized_email)`,
          [row.recipient_email],
        );
        if (!consent.rowCount) {
          if (row.run_id) {
            await pool.query(
              `UPDATE email_flow_scheduled SET status = 'skipped', claimed_at = NULL, skipped_reason = 'No current marketing consent'
               WHERE run_id = $1 AND status = 'pending'`, [row.run_id]);
            await pool.query(
              `UPDATE email_flow_runs SET status = 'cancelled', exit_reason = 'no_marketing_consent', finished_at = now()
               WHERE id = $1 AND status = 'active'`, [row.run_id]);
          } else {
            await pool.query(
              `UPDATE email_flow_scheduled SET status = 'skipped', claimed_at = NULL, skipped_reason = 'No current marketing consent'
               WHERE id = $1`, [row.id]);
          }
          skipped++;
          continue;
        }
      }

      if (row.condition_type !== "always") {
        const prior = row.run_id && row.condition_step_id ? await pool.query(
          `SELECT sent_at, first_opened_at, first_clicked_at FROM email_deliveries
           WHERE flow_run_id = $1 AND flow_step_id = $2 AND is_test = false
           ORDER BY id DESC LIMIT 1`,
          [row.run_id, row.condition_step_id],
        ) : { rows: [] };
        const delivery = prior.rows[0];
        const opened = !!(delivery?.first_opened_at || delivery?.first_clicked_at);
        const clicked = !!delivery?.first_clicked_at;
        const conditionPassed = !!delivery?.sent_at && (
          (row.condition_type === "opened" && opened) ||
          (row.condition_type === "not_opened" && !opened) ||
          (row.condition_type === "clicked" && clicked) ||
          (row.condition_type === "not_clicked" && !clicked)
        );
        if (!conditionPassed) {
          await pool.query(
            `UPDATE email_flow_scheduled SET status = 'skipped', claimed_at = NULL, skipped_reason = $2 WHERE id = $1`,
            [row.id, `Condition not met: ${row.condition_type}`],
          );
          if (row.run_id) await pool.query(
            `UPDATE email_flow_runs r SET status = 'completed', finished_at = now()
             WHERE r.id = $1 AND r.status = 'active'
               AND NOT EXISTS (SELECT 1 FROM email_flow_scheduled s WHERE s.run_id = r.id AND s.status = 'pending')`,
            [row.run_id],
          );
          skipped++;
          continue;
        }
      }

      if (row.action_type === "google_review_request") {
        if (!row.contact_id) throw new Error("Canonical contact missing for review request");
        await queueGoogleReviewRequest({ contactId: Number(row.contact_id), templateKey: row.review_template_key || "google-review-request", automationFlowId: row.flow_id, automationRunId: row.run_id || undefined, automationStepId: row.step_id });
        await pool.query(`UPDATE email_flow_scheduled SET status='sent',sent_at=now(),claimed_at=NULL WHERE id=$1`, [row.id]);
        if (row.run_id) await pool.query(
          `UPDATE email_flow_runs r SET status='completed',finished_at=now() WHERE r.id=$1 AND r.status='active'
           AND NOT EXISTS (SELECT 1 FROM email_flow_scheduled s WHERE s.run_id=r.id AND s.status='pending')`, [row.run_id]);
        sent++;
        continue;
      }

      const contactVars = contactMessageValues(row);
      const messageVars = {
        ...(row.vars || {}),
        ...contactVars,
        first_name: row.name ? contactVars.first_name : row.vars?.first_name || contactVars.first_name,
      };
      const result = await sendEmail({
        to: row.recipient_email,
        subject: applyVars(row.subject, messageVars),
        html: applyVars(row.body_html, messageVars),
        from: row.from_email,
        templateKey: `automation:${row.flow_id}:step:${row.step_id}`,
        category: "automation",
        flowStepId: row.step_id,
        flowRunId: row.run_id || undefined,
      });
      if (!result.ok) throw new Error("Email provider rejected send");
      await pool.query(
        `UPDATE email_flow_scheduled SET status = $2,
           sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END,
           claimed_at = NULL, email_delivery_id = $3 WHERE id = $1`,
        [row.id, result.skipped ? "skipped" : "sent", result.deliveryId],
      );
      if (result.skipped) {
        if (row.run_id) await pool.query(
          `UPDATE email_flow_runs r SET status = 'completed', finished_at = now()
           WHERE r.id = $1 AND r.status = 'active'
             AND NOT EXISTS (SELECT 1 FROM email_flow_scheduled s WHERE s.run_id = r.id AND s.status = 'pending')`,
          [row.run_id],
        );
        skipped++;
        continue;
      }
      sent++;
      if (row.trigger_key === "course_inactivity" && row.user_id && row.course_slug) {
        try {
          await createNotification(row.user_id, "course_inactive", {
            title: "Continue where you left off",
            body: `${row.vars?.course_title || row.course_title || "Your course"} (${row.vars?.completed_lessons || "0"}/${row.vars?.total_lessons || "0"} lessons done)`,
            link: `/account/courses/${row.course_slug}`,
          });
          nudged++;
        } catch (error) {
          console.error("Course inactivity notification failed after email send:", error);
        }
      }
      if (row.run_id) {
        await pool.query(
          `UPDATE email_flow_runs r SET status = 'completed', finished_at = now()
           WHERE r.id = $1 AND r.status = 'active'
             AND NOT EXISTS (SELECT 1 FROM email_flow_scheduled s WHERE s.run_id = r.id AND s.status = 'pending')`,
          [row.run_id],
        );
      }
    } catch (error) {
      await pool.query(
        `UPDATE email_flow_scheduled SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
           claimed_at = NULL, last_error = $2 WHERE id = $1`,
        [row.id, error instanceof Error ? error.message.slice(0, 500) : "Unknown send failure"],
      );
    }
  }

  const reviewRequests = await dispatchDueReviewRequests(25);
  const scheduledContacts = await dispatchScheduledContactEmails(25);
  const campaignsQueued = await queueDueCampaigns(10);
  const campaigns = await sendPendingCampaignBatch(25);
  // Pub/Sub push notifications are the primary sync trigger; this is the
  // fallback for a missed/failed push, checked every time this cron runs
  // but a no-op unless a connected location is actually overdue (>6h) or a
  // prior sync attempt failed and is due for retry.
  const googleReviews = await reconcileGoogleReviewsIfDue().catch((error) => {
    console.error("Google review reconciliation failed:", error);
    return { skipped: false, error: true };
  });
  const outbox = await retryEmailOutbox().catch((error) => {
    console.error("Email outbox retry failed:", error);
    return { error: true };
  });
  await sweepFailureAlerts().catch((error) => console.error("Failure alert sweep failed:", error));
  // The cron runs every 5 minutes; the health check only needs to run hourly.
  if (new Date().getUTCMinutes() < 5) {
    await checkEmailHealth().catch((error) => console.error("Email health check failed:", error));
  }
  const alertsEmailed = await emailPendingAlerts().catch((error) => {
    console.error("Alert digest failed:", error);
    return 0;
  });
  return { checked: due.rows.length, sent, skipped, nudged, reviewRequests, scheduledContacts, campaignsQueued, campaigns, googleReviews, outbox, alertsEmailed };
}
