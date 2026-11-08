import { Agent, request as undiciRequest, type Dispatcher } from "undici";
import { signWebhookBody } from "@/lib/webhookSigning";
import { validateOutboundWebhookUrl } from "@/lib/webhookUrlValidation";
import { classifyHttpStatus, type DeliveryOutcome } from "@/lib/webhookRetry";
import { SITE_NAME } from "@/config/brand";
import { SITE_URL } from "@/lib/liveSiteUrl";

const MAX_RESPONSE_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
export const WEBHOOK_USER_AGENT = `${SITE_NAME.replace(/\s+/g, "")}-Webhooks/1.0 (+${SITE_URL})`;

export type WebhookAttemptResult = {
  outcome: DeliveryOutcome;
  httpStatus: number | null;
  responseExcerpt: string | null;
  errorMessage: string | null;
};

/**
 * The signing + HTTP + response-classification mechanics, with no SSRF/DNS
 * concern of its own -- that's `deliverWebhookAttempt` below, which is what
 * production code (the dispatcher, the console's test-send) actually calls.
 * This lower-level function is exported so it can be exercised directly
 * against a local mocked HTTP server in tests (successful/timeout/429/4xx/5xx),
 * without needing to route a test target through the loopback-rejecting SSRF
 * gate -- SSRF validation is tested independently in webhookUrlValidation.
 * Never called while a DB transaction is open.
 */
export async function performSignedHttpDelivery(input: {
  url: string;
  secret: string;
  eventUuid: string;
  eventType: string;
  bodyJson: string;
  timeoutMs?: number;
  dispatcher?: Dispatcher;
}): Promise<WebhookAttemptResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signWebhookBody(input.secret, timestamp, input.bodyJson);

  try {
    const response = await undiciRequest(input.url, {
      method: "POST",
      dispatcher: input.dispatcher,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      // No maxRedirections dispatcher option is set, so undici never
      // auto-follows a 3xx -- see webhookRetry.ts's classifyHttpStatus doc
      // comment for why that's deliberate.
      headers: {
        "content-type": "application/json",
        "user-agent": WEBHOOK_USER_AGENT,
        "x-im-webhook-signature": signature,
        "x-im-webhook-timestamp": timestamp,
        "x-im-webhook-event-id": input.eventUuid,
        "x-im-webhook-event-type": input.eventType,
      },
      body: input.bodyJson,
    });

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      if (size < MAX_RESPONSE_BYTES) {
        const remaining = MAX_RESPONSE_BYTES - size;
        chunks.push(Buffer.from(chunk).subarray(0, remaining));
      }
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES * 4) break;
    }
    const excerpt = Buffer.concat(chunks).toString("utf8").slice(0, MAX_RESPONSE_BYTES);

    return {
      outcome: classifyHttpStatus(response.statusCode),
      httpStatus: response.statusCode,
      responseExcerpt: excerpt || null,
      errorMessage: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown delivery error";
    const isTimeout = /timeout/i.test(message);
    return {
      outcome: "retryable_failure",
      httpStatus: null,
      responseExcerpt: null,
      errorMessage: (isTimeout ? "Request timed out: " : "") + message.slice(0, 500),
    };
  }
}

/** Builds an undici Agent whose connections for this request are pinned to
 * exactly one already-validated address, closing the DNS-rebinding TOCTOU
 * gap between SSRF validation and the real connect. Exported (not inlined
 * into deliverWebhookAttempt) so the lookup callback itself -- the part that
 * actually broke once in production, see the comment inside -- can be
 * exercised directly against a local mock server in tests. */
export function createPinnedDispatcher(address: string, family: 4 | 6): Agent {
  return new Agent({
    connect: {
      // Node's connect logic (Happy Eyeballs / lookupAndConnectMultiple)
      // calls a custom `lookup` with `options.all` set and expects the
      // array-form callback `(err, addresses[])` in that case -- the
      // single-address 3-arg form `(err, address, family)` throws
      // ERR_INVALID_IP_ADDRESS internally if that's what's actually invoked.
      // Support both forms so pinning works regardless of which one Node
      // picks for a given connection attempt. Caught live in production
      // verification (2026-08-28) before any real destination depended on
      // it -- see test/webhookDelivery.test.mjs's pinned-dispatcher case.
      lookup(_hostname, options, callback) {
        if (options?.all) {
          callback(null, [{ address, family }]);
        } else {
          callback(null, address, family);
        }
      },
    },
  });
}

/** Real production delivery path: SSRF-validates the destination, DNS-pins
 * the connection to the exact address that was validated (closing the
 * DNS-rebinding TOCTOU gap between validation and connect -- same pattern as
 * src/lib/safeRemoteImage.ts), then performs the signed request. */
export async function deliverWebhookAttempt(input: {
  url: string;
  secret: string;
  eventUuid: string;
  eventType: string;
  bodyJson: string;
  timeoutMs?: number;
}): Promise<WebhookAttemptResult> {
  const validation = await validateOutboundWebhookUrl(input.url);
  if (!validation.ok) {
    return { outcome: "permanent_failure", httpStatus: null, responseExcerpt: null, errorMessage: validation.reason };
  }

  const dispatcher = createPinnedDispatcher(validation.resolvedAddress, validation.family as 4 | 6);

  try {
    return await performSignedHttpDelivery({ ...input, dispatcher });
  } finally {
    await dispatcher.close();
  }
}
