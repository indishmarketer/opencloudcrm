import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { buildEventEnvelope } from "@/lib/webhookRedaction";
import { deliverWebhookAttempt } from "@/lib/webhookDelivery";
import { SITE_NAME } from "@/config/brand";

/** Sends a synthetic test.ping event straight at one destination, through
 * the exact same delivery code path (SSRF validation, HMAC signing, timeout,
 * response capture) as a real event, so a green result here genuinely means
 * the destination is reachable and verifying signatures correctly. Never
 * sends real customer data -- the payload is a fixed synthetic fixture. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const destinationId = Number(id);
  if (!Number.isInteger(destinationId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const destResult = await pool.query(
    "SELECT id, url, signing_secret FROM webhook_destinations WHERE id = $1",
    [destinationId]
  );
  const destination = destResult.rows[0];
  if (!destination) return NextResponse.json({ error: "Destination not found." }, { status: 404 });

  const eventUuid = randomUUID();
  const occurredAt = new Date();
  const payload = buildEventEnvelope({
    eventId: eventUuid,
    eventType: "test.ping",
    occurredAt,
    source: "console",
    contactId: null,
    data: {
      message: `This is a test event sent manually from the ${SITE_NAME} console. No real customer data is included.`,
    },
  });

  const eventInsert = await pool.query<{ id: string }>(
    `INSERT INTO webhook_outbox_events (event_uuid, event_type, source, source_record_id, payload, occurred_at, is_test)
     VALUES ($1, 'test.ping', 'console_test', $2, $3::jsonb, $4, true)
     RETURNING id`,
    [eventUuid, `${destinationId}:${eventUuid}`, JSON.stringify(payload), occurredAt]
  );
  const eventId = eventInsert.rows[0].id;

  const bodyJson = JSON.stringify(payload);
  const result = await deliverWebhookAttempt({
    url: destination.url,
    secret: destination.signing_secret,
    eventUuid,
    eventType: "test.ping",
    bodyJson,
  });

  await pool.query(
    `INSERT INTO webhook_deliveries
       (destination_id, event_id, status, attempt_count, claimed_at, last_http_status, last_response_excerpt, last_error, delivered_at, last_attempted_at)
     VALUES ($1, $2, $3, 1, NULL, $4, $5, $6, $7, now())`,
    [
      destinationId,
      eventId,
      result.outcome === "delivered" ? "delivered" : "dead",
      result.httpStatus,
      result.responseExcerpt,
      result.errorMessage,
      result.outcome === "delivered" ? new Date() : null,
    ]
  );

  return NextResponse.json({
    ok: result.outcome === "delivered",
    http_status: result.httpStatus,
    response_excerpt: result.responseExcerpt,
    error: result.errorMessage,
  });
}
