/** Defense-in-depth: every emitWebhookEvent() call site is expected to pass
 * only a hand-picked, business-relevant `data` object (see webhookEvents.ts),
 * never a raw DB row -- but this strips any key that looks like a secret
 * anyway, recursively, in case a future call site slips up. */
const SENSITIVE_KEY_PATTERN = /password|secret|token|hash|api[_-]?key|signing|credential|private/i;

export function redactSensitiveKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveKeys(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactSensitiveKeys(val);
    }
    return out as T;
  }
  return value;
}

export type WebhookEventEnvelope = {
  schema_version: 1;
  event_id: string;
  event_type: string;
  occurred_at: string;
  source: string;
  contact_id: number | null;
  data: Record<string, unknown>;
};

/** Builds the exact JSON body sent to subscribers. Explicit schema/version
 * so a receiving system can evolve safely; only whitelisted `data` fields
 * the caller chose to include, run through redaction as a last safety net. */
export function buildEventEnvelope(input: {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  source: string;
  contactId: number | null;
  data: Record<string, unknown>;
}): WebhookEventEnvelope {
  return {
    schema_version: 1,
    event_id: input.eventId,
    event_type: input.eventType,
    occurred_at: input.occurredAt.toISOString(),
    source: input.source,
    contact_id: input.contactId,
    data: redactSensitiveKeys(input.data),
  };
}
