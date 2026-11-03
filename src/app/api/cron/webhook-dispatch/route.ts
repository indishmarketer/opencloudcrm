import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool, withTransaction } from "@/lib/db";
import { deliverWebhookAttempt } from "@/lib/webhookDelivery";
import { MAX_DELIVERY_ATTEMPTS, nextBackoffDelayMs } from "@/lib/webhookRetry";
import { syncVoiceAgentInterestWebhookEvents } from "@/lib/webhookEvents";

const CLAIM_BATCH_SIZE = 25;
const STALE_CLAIM_MINUTES = 10;

/** Separate CRON_SECRET-protected route, deliberately not folded into
 * /api/cron/email-dispatch: that route's failure domain is email-specific
 * (goal checks, marketing consent, condition branches) and runs its own
 * FOR UPDATE SKIP LOCKED claim over a different table. Outbound webhook
 * delivery is a distinct concern with its own retry/backoff semantics and
 * an actual outbound HTTP call in the loop -- keeping it in its own route
 * means a slow/hanging receiver can never delay email dispatch, and a bug
 * in one dispatcher can't take down the other. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const expected = secret ? `Bearer ${secret}` : null;
  const authorized = !!expected && !!auth && expected.length === auth.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(auth));
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const voiceAgentEventsEmitted = await syncVoiceAgentInterestWebhookEvents();

  // Claim due deliveries for currently-enabled destinations only. SKIP
  // LOCKED means two overlapping cron invocations (a slow prior run plus a
  // new one firing) can never claim the same row -- each gets a disjoint
  // batch. Stale claims (a prior run that crashed mid-delivery without
  // releasing) are reclaimable after STALE_CLAIM_MINUTES, same pattern as
  // src/lib/emailDispatcher.ts. This claim step is pure DB writes, no HTTP.
  const claimed = await withTransaction((client) => client.query(
    `WITH candidates AS (
      SELECT wd.id
      FROM webhook_deliveries wd
      JOIN webhook_destinations d ON d.id = wd.destination_id
      WHERE wd.status IN ('pending', 'processing', 'failed')
        AND wd.next_attempt_at <= now()
        AND d.enabled = true
        AND (wd.claimed_at IS NULL OR wd.claimed_at < now() - ($1 * interval '1 minute'))
      ORDER BY wd.next_attempt_at
      FOR UPDATE OF wd SKIP LOCKED
      LIMIT $2
    ), updated AS (
      UPDATE webhook_deliveries wd SET status = 'processing', claimed_at = now(), attempt_count = attempt_count + 1
      FROM candidates WHERE wd.id = candidates.id
      RETURNING wd.*
    )
    SELECT u.id, u.destination_id, u.attempt_count,
           d.url, d.signing_secret,
           e.event_uuid, e.event_type, e.payload
    FROM updated u
    JOIN webhook_destinations d ON d.id = u.destination_id
    JOIN webhook_outbox_events e ON e.id = u.event_id`,
    [STALE_CLAIM_MINUTES, CLAIM_BATCH_SIZE],
  ));

  let delivered = 0;
  let retried = 0;
  let dead = 0;

  for (const row of claimed.rows) {
    const result = await deliverWebhookAttempt({
      url: row.url,
      secret: row.signing_secret,
      eventUuid: row.event_uuid,
      eventType: row.event_type,
      bodyJson: JSON.stringify(row.payload),
    });

    if (result.outcome === "delivered") {
      await pool.query(
        `UPDATE webhook_deliveries SET status = 'delivered', delivered_at = now(), last_attempted_at = now(), claimed_at = NULL,
           last_http_status = $2, last_response_excerpt = $3, last_error = NULL
         WHERE id = $1`,
        [row.id, result.httpStatus, result.responseExcerpt],
      );
      delivered++;
      continue;
    }

    if (result.outcome === "permanent_failure") {
      await pool.query(
        `UPDATE webhook_deliveries SET status = 'dead', claimed_at = NULL, last_attempted_at = now(),
           last_http_status = $2, last_response_excerpt = $3, last_error = $4
         WHERE id = $1`,
        [row.id, result.httpStatus, result.responseExcerpt, result.errorMessage],
      );
      dead++;
      continue;
    }

    // retryable_failure
    if (row.attempt_count >= MAX_DELIVERY_ATTEMPTS) {
      await pool.query(
        `UPDATE webhook_deliveries SET status = 'dead', claimed_at = NULL, last_attempted_at = now(),
           last_http_status = $2, last_response_excerpt = $3, last_error = $4
         WHERE id = $1`,
        [row.id, result.httpStatus, result.responseExcerpt, result.errorMessage],
      );
      dead++;
    } else {
      const delayMs = nextBackoffDelayMs(row.attempt_count);
      await pool.query(
        `UPDATE webhook_deliveries SET status = 'failed', claimed_at = NULL, last_attempted_at = now(),
           next_attempt_at = now() + ($2 * interval '1 millisecond'),
           last_http_status = $3, last_response_excerpt = $4, last_error = $5
         WHERE id = $1`,
        [row.id, delayMs, result.httpStatus, result.responseExcerpt, result.errorMessage],
      );
      retried++;
    }
  }

  return NextResponse.json({
    ok: true,
    claimed: claimed.rows.length,
    delivered,
    retried,
    dead,
    voiceAgentEventsEmitted,
  });
}
