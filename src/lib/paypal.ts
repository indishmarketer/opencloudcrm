import { SITE_NAME } from "@/config/brand";

// PAYPAL_ENV=sandbox points every call (orders, capture, webhook
// verification) at PayPal's sandbox, for end-to-end tests with sandbox
// credentials and no real money. Anything else is live.
const PAYPAL_API = process.env.PAYPAL_ENV === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PayPal is not configured.");

  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const body = await res.json();
  return body.access_token;
}

/** The public client id for the PayPal buttons, or null when PayPal isn't
 * fully configured (then PayPal is hidden everywhere). */
export function getPaypalClientId(): string | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  return clientId && process.env.PAYPAL_CLIENT_SECRET?.trim() ? clientId : null;
}

/** Creates an order for the PayPal JS SDK buttons on our page. The card
 * button opens PayPal's card form inline (no PayPal login, buyer stays on
 * the site); capture happens in /api/payments/paypal/capture-order. */
export async function createPaypalOrder(input: {
  amountUsd: number;
  customId: string;
  description: string;
  /** Sent as PayPal-Request-Id so a retried request can't create a second order. */
  requestId: string;
  /** Known buyer details to prefill PayPal's guest card form and PayPal
   * login screen with -- saves retyping, doesn't make the field disappear.
   * PayPal's orders v2 `payer.phone` has no separate country-code field, so
   * we send the full digits (calling code + number) as the national number. */
  payerEmail?: string | null;
  payerPhone?: string | null;
}): Promise<string> {
  const token = await getAccessToken();
  const payer = (input.payerEmail || input.payerPhone) ? {
    ...(input.payerEmail ? { email_address: input.payerEmail } : {}),
    ...(input.payerPhone ? { phone: { phone_type: "MOBILE", phone_number: { national_number: input.payerPhone } } } : {}),
  } : undefined;
  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": input.requestId,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: input.customId,
          description: input.description.slice(0, 127),
          amount: { currency_code: "USD", value: input.amountUsd.toFixed(2) },
        },
      ],
      ...(payer ? { payer } : {}),
      application_context: { brand_name: SITE_NAME, shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" },
    }),
  });
  if (!res.ok) throw new Error(`PayPal order creation failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const body = await res.json();
  if (!body.id) throw new Error("PayPal order has no id.");
  return body.id;
}

export async function verifyPaypalWebhookSignature(
  headers: {
    transmissionId: string | null;
    transmissionTime: string | null;
    certUrl: string | null;
    authAlgo: string | null;
    transmissionSig: string | null;
  },
  webhookEvent: unknown
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  if (
    !headers.transmissionId ||
    !headers.transmissionTime ||
    !headers.certUrl ||
    !headers.authAlgo ||
    !headers.transmissionSig
  ) {
    return false;
  }

  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      transmission_id: headers.transmissionId,
      transmission_time: headers.transmissionTime,
      cert_url: headers.certUrl,
      auth_algo: headers.authAlgo,
      transmission_sig: headers.transmissionSig,
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    }),
  });
  if (!res.ok) return false;
  const body = await res.json();
  return body.verification_status === "SUCCESS";
}

export async function capturePaypalOrder(orderId: string): Promise<{
  status: string;
  customId: string | null;
  captureId: string | null;
  amount: string | null;
  currency: string | null;
  /** Digits only (calling code + number), when PayPal's own checkout
   * collected one for this payer (its own guest-card form or a logged-in
   * PayPal account) and returned it on the order -- not guaranteed on
   * every payment, since PayPal decides when to ask for it, not us. */
  payerPhone: string | null;
}> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Same id for every capture attempt of this order: a retry returns
      // the original capture instead of failing or double-processing.
      "PayPal-Request-Id": `capture-${orderId}`,
    },
  });
  if (!res.ok) throw new Error(`PayPal capture failed: ${res.status}`);
  const body = await res.json();
  const unit = body.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const payerPhoneDigits = body.payer?.phone?.phone_number?.national_number;
  return {
    status: body.status,
    customId: unit?.custom_id || null,
    captureId: capture?.id || null,
    amount: capture?.amount?.value || null,
    currency: capture?.amount?.currency_code || null,
    payerPhone: typeof payerPhoneDigits === "string" ? payerPhoneDigits.replace(/\D/g, "") || null : null,
  };
}
