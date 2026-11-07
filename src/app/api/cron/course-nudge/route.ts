import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { pool } from "@/lib/db";
import { emitCourseInactivityEvents, syncCommunityInactivityFlows, syncCourseInactivityFlows } from "@/lib/emailAutomation";
import { dispatchDueEmailWork } from "@/lib/emailDispatcher";
import { pruneExpiredMedia } from "@/lib/whatsappMedia";

/** Route name kept as "course-nudge" so the existing daily crontab entry
 * on the VPS doesn't need to change -- this is now the generic email
 * automation dispatcher, not just the course nudge. Sends every due step
 * of every scheduled email flow. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  
  const expected = secret ? `Bearer ${secret}` : null;
  const isMatch =
    expected && auth &&
    expected.length === auth.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(auth));

  if (!isMatch) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Sync and schedule course-inactivity flows based on individual user
  // enrollment/lesson progress timestamps (spread per-user, not batch-blasted).
  const courseInactivityEvents = await emitCourseInactivityEvents();
  await syncCourseInactivityFlows();
  await syncCommunityInactivityFlows();

  const dispatch = await dispatchDueEmailWork();

  // Runs once/day (this route's whole cadence), so piggyback the retention
  // cleanup here instead of a separate cron entry. Each of these tables has
  // no other cleanup mechanism and would otherwise grow forever.
  const otpCleanup = await pool.query("DELETE FROM otp_codes WHERE expires_at < now() - interval '48 hours'");
  const tokenCleanup = await pool.query("DELETE FROM used_auth_tokens WHERE created_at < now() - interval '48 hours'");
  const flowCleanup = await pool.query(
    "DELETE FROM email_flow_scheduled WHERE status IN ('sent', 'failed', 'skipped') AND send_at < now() - interval '90 days'"
  );
  const rateLimitCleanup = await pool.query(
    "DELETE FROM rate_limits WHERE window_start < now() - interval '7 days'",
  );
  // Outbound webhook delivery history: keep successful deliveries 30 days
  // (enough for a "yep it worked" glance), keep dead/failed-out ones 90 days
  // (diagnosis needs the longer window), then drop outbox events once every
  // delivery row pointing at them is gone.
  const webhookDeliveredCleanup = await pool.query(
    "DELETE FROM webhook_deliveries WHERE status = 'delivered' AND delivered_at < now() - interval '30 days'",
  );
  const webhookDeadCleanup = await pool.query(
    "DELETE FROM webhook_deliveries WHERE status = 'dead' AND last_attempted_at < now() - interval '90 days'",
  );
  const webhookEventCleanup = await pool.query(
    `DELETE FROM webhook_outbox_events e WHERE e.created_at < now() - interval '90 days'
       AND NOT EXISTS (SELECT 1 FROM webhook_deliveries wd WHERE wd.event_id = e.id)`,
  );
  // "Needs attention" alerts: once resolved there is no reason to keep the
  // row, but a 30-day tail stays so "what did we deal with last week"
  // (the Recently Resolved list) still has something to show.
  const alertCleanup = await pool.query(
    "DELETE FROM system_alerts WHERE resolved_at IS NOT NULL AND resolved_at < now() - interval '30 days'",
  );

  // WhatsApp conversation files, which are the one piece of storage here
  // that is paid for by the gigabyte rather than by the row. Never deletes
  // a template's approved sample, which every send of that template points
  // at; capped per run so a backlog cannot tie up the cron.
  const whatsappMedia = await pruneExpiredMedia().catch((err) => {
    console.error("WhatsApp media retention sweep failed:", err);
    return { deleted: 0, scanned: 0 };
  });

  return NextResponse.json({
    ok: true,
    course_inactivity_workflow_events: courseInactivityEvents,
    ...dispatch,
    cleaned: {
      whatsapp_media_files: whatsappMedia.deleted,
      otp_codes: otpCleanup.rowCount ?? 0,
      used_auth_tokens: tokenCleanup.rowCount ?? 0,
      email_flow_scheduled: flowCleanup.rowCount ?? 0,
      rate_limits: rateLimitCleanup.rowCount ?? 0,
      webhook_deliveries_delivered: webhookDeliveredCleanup.rowCount ?? 0,
      webhook_deliveries_dead: webhookDeadCleanup.rowCount ?? 0,
      webhook_outbox_events: webhookEventCleanup.rowCount ?? 0,
      system_alerts: alertCleanup.rowCount ?? 0,
    },
  });
}
