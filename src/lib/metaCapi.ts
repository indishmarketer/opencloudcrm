import crypto from "node:crypto";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export type MetaEventName =
  | "ViewContent"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Purchase"
  | "CompleteRegistration"
  | "Lead";

/**
 * Sends one event to Meta's Conversions API. Deliberately fire-and-forget
 * (best effort, never throws) -- ad tracking must never be able to break a
 * signup or a payment flow. Silently no-ops if the pixel isn't configured.
 */
export async function sendMetaEvent(params: {
  eventName: MetaEventName;
  eventId: string;
  eventSourceUrl: string;
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  email?: string | null;
  externalId?: string | number | null;
  customData?: Record<string, unknown>;
}): Promise<void> {
  if (!PIXEL_ID || !ACCESS_TOKEN) return;

  const userData: Record<string, unknown> = {};
  if (params.ip) userData.client_ip_address = params.ip;
  if (params.userAgent) userData.client_user_agent = params.userAgent;
  if (params.fbp) userData.fbp = params.fbp;
  if (params.fbc) userData.fbc = params.fbc;
  if (params.email) userData.em = [sha256(params.email)];
  if (params.externalId != null) userData.external_id = [sha256(String(params.externalId))];

  const payload = {
    data: [
      {
        event_name: params.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.eventId,
        event_source_url: params.eventSourceUrl,
        action_source: "website",
        user_data: userData,
        ...(params.customData ? { custom_data: params.customData } : {}),
      },
    ],
  };

  try {
    await fetch(`https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // best-effort only, never let ad tracking delivery block a real user flow
  }
}
