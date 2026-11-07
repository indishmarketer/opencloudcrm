import { randomUUID } from "node:crypto";
import { pool, withTransaction } from "@/lib/db";
import { ensureContact } from "@/lib/contacts";
import { buildEventEnvelope } from "@/lib/webhookRedaction";
import { isValidWebhookEventType, type WebhookEventType } from "@/lib/webhookEventCatalogue";

/**
 * The one documented helper for emitting a real outbound webhook event.
 * Call this from the application code that observes an action happening --
 * never from a generic/polling place -- and always fire-and-forget
 * (`.catch(() => {})`), the same convention already used for
 * triggerEmailFlow() in src/lib/emailAutomation.ts. A webhook receiver being
 * slow, down, or misconfigured must never affect the primary action (a
 * payment, a signup, a post) that triggered it.
 *
 * Idempotency: (source, sourceRecordId, eventType) is a unique key on
 * webhook_outbox_events (mirrors contact_activities' own
 * (source, source_record_id, activity_type) pattern in src/lib/contacts.ts).
 * Calling this twice for the same real-world action -- a webhook retry
 * re-running the same code path, or two code paths that both observe the
 * same action -- is a safe no-op the second time; only the first call
 * fans out delivery rows.
 *
 * `data` must be a hand-picked, business-relevant object -- never pass a
 * raw DB row. It's still run through redactSensitiveKeys() as a last
 * safety net, but the real control is at the call site.
 *
 * Never does an HTTP request itself; only writes rows. Actual delivery
 * happens later, out-of-band, in the /api/cron/webhook-dispatch dispatcher.
 */
export async function emitWebhookEvent(input: {
  eventType: WebhookEventType;
  source: string;
  sourceRecordId: string | number;
  data: Record<string, unknown>;
  occurredAt?: Date;
  contactEmail?: string | null;
  contactName?: string | null;
  userId?: number | null;
}): Promise<void> {
  if (!isValidWebhookEventType(input.eventType)) {
    throw new Error(`Unknown webhook event type: ${input.eventType}`);
  }
  const occurredAt = input.occurredAt ?? new Date();

  let contactId: number | null = null;
  if (input.contactEmail) {
    contactId = await ensureContact({ email: input.contactEmail, name: input.contactName, userId: input.userId });
  }

  const eventUuid = randomUUID();
  const payload = buildEventEnvelope({
    eventId: eventUuid,
    eventType: input.eventType,
    occurredAt,
    source: input.source,
    contactId,
    data: input.data,
  });

  const storedEvent = await withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO webhook_outbox_events (event_uuid, event_type, source, source_record_id, contact_id, payload, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (source, source_record_id, event_type) DO NOTHING
       RETURNING id`,
      [eventUuid, input.eventType, input.source, String(input.sourceRecordId), contactId, JSON.stringify(payload), occurredAt],
    );
    const eventId = inserted.rows[0]?.id;
    if (!eventId) {
      // The outbox row may predate a workflow being activated. Reuse its
      // stable event id/payload below so active workflows can catch up once.
      const existing = await client.query<{ event_uuid: string; event_type: string; payload: unknown }>(
        `SELECT event_uuid, event_type, payload FROM webhook_outbox_events
         WHERE source = $1 AND source_record_id = $2 AND event_type = $3 LIMIT 1`,
        [input.source, String(input.sourceRecordId), input.eventType],
      );
      return existing.rows[0] || null;
    }

    await client.query(
      `INSERT INTO webhook_deliveries (destination_id, event_id)
       SELECT d.id, $1 FROM webhook_destinations d
       WHERE d.enabled = true AND $2 = ANY(d.event_types)`,
      [eventId, input.eventType],
    );
    return { event_uuid: eventUuid, event_type: input.eventType, payload };
  });

  if (storedEvent) {
    await pool.query(
      "SELECT queue_visual_workflow_event_record($1::uuid, $2, $3::jsonb)",
      [storedEvent.event_uuid, storedEvent.event_type, JSON.stringify(storedEvent.payload)],
    );
  }
}
