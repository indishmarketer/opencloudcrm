declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/**
 * Fires a Meta Pixel event in the browser AND the matching Conversions API
 * event server-side, sharing one event ID so Meta dedupes them into a
 * single event instead of double-counting. Best-effort: never throws, so a
 * tracking failure can't block signup/checkout/purchase.
 */
export function trackMetaEvent(
  eventName: "ViewContent" | "InitiateCheckout" | "AddPaymentInfo" | "Lead",
  customData?: Record<string, unknown>
) {
  if (typeof window === "undefined") return;

  const eventId = crypto.randomUUID();
  const eventSourceUrl = window.location.href;

  if (typeof window.fbq === "function") {
    window.fbq("track", eventName, customData || {}, { eventID: eventId });
  }

  fetch("/api/track/meta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName, eventId, eventSourceUrl, customData }),
    keepalive: true,
  }).catch(() => {});
}

/** Browser pixel only, with a caller-chosen event id. Used for Purchase:
 * the server already sent the Conversions API event with the same id when
 * the payment was verified, so Meta merges the two into one purchase. */
export function trackMetaPixelEvent(eventName: "Purchase", customData: Record<string, unknown>, eventId: string) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("track", eventName, customData, { eventID: eventId });
}
