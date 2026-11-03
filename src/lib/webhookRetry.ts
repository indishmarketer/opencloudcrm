export type DeliveryOutcome = "delivered" | "retryable_failure" | "permanent_failure";

/** Classifies an HTTP response status for outbound webhook delivery.
 * - 2xx: success.
 * - 408/429: transient (timeout / rate-limited by the receiver), retryable.
 * - other 4xx: the receiver has rejected the request as invalid (bad auth,
 *   wrong shape, endpoint gone) -- retrying with the same payload won't fix
 *   that, so these are treated as permanent and go straight to 'dead'
 *   instead of wasting retry budget hammering a misconfigured endpoint.
 * - 3xx: webhook delivery deliberately never follows redirects (see
 *   webhookDelivery.ts) -- a redirect response itself means the destination
 *   is misconfigured, retryable in case it's a transient edge redirect but
 *   not auto-followed for SSRF-safety reasons.
 * - 5xx: the receiver's own failure, retryable. */
export function classifyHttpStatus(status: number): DeliveryOutcome {
  if (status >= 200 && status < 300) return "delivered";
  if (status === 408 || status === 429) return "retryable_failure";
  if (status >= 300 && status < 500) return status >= 400 ? "permanent_failure" : "retryable_failure";
  return "retryable_failure";
}

export const MAX_DELIVERY_ATTEMPTS = 7;

/** Exponential backoff with a fixed schedule, attempt 1 is the first retry
 * after an initial failure (attempt_count is incremented before this is
 * consulted, so nextBackoffDelayMs(1) is the delay before the 2nd attempt). */
const BACKOFF_SCHEDULE_MS = [
  60_000, // 1 min
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
  2 * 60 * 60_000, // 2 hours
  6 * 60 * 60_000, // 6 hours
  24 * 60 * 60_000, // 24 hours
];

export function nextBackoffDelayMs(attemptNumber: number): number {
  const index = Math.min(Math.max(attemptNumber - 1, 0), BACKOFF_SCHEDULE_MS.length - 1);
  return BACKOFF_SCHEDULE_MS[index];
}
