import crypto from "node:crypto";

/** Razorpay Standard Checkout (Orders API). Keys come from the
 * RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET env vars (set in Coolify, never in
 * the repo). The key id is public (it goes to the browser); the secret
 * stays on the server. Razorpay is offered on every paid course once both
 * are set, and hidden everywhere when either is missing. */

const RAZORPAY_API = "https://api.razorpay.com/v1";

function keys(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  return keyId && keySecret ? { keyId, keySecret } : null;
}

/** The public key id for checkout.js, or null when Razorpay isn't configured. */
export function getRazorpayKeyId(): string | null {
  return keys()?.keyId ?? null;
}

async function razorpayApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const k = keys();
  if (!k) throw new Error("Razorpay is not configured.");
  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method: init?.method || "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${k.keyId}:${k.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Razorpay ${init?.method || "GET"} ${path} failed: ${res.status} ${detail.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  notes: Record<string, unknown> | unknown[];
};

export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
  email?: string;
  /** The phone number Razorpay's own checkout collects by default. */
  contact?: string;
  notes: Record<string, unknown> | unknown[];
};

export function createRazorpayOrder(input: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  return razorpayApi<RazorpayOrder>("/orders", {
    method: "POST",
    body: { amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes },
  });
}

export function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrder> {
  return razorpayApi<RazorpayOrder>(`/orders/${encodeURIComponent(orderId)}`);
}

export function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  return razorpayApi<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

/** Only needed when the account isn't set to auto-capture; harmless otherwise. */
export function captureRazorpayPayment(paymentId: string, amountPaise: number): Promise<RazorpayPayment> {
  return razorpayApi<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: "POST",
    body: { amount: amountPaise, currency: "INR" },
  });
}

/** Checkout's success handler returns razorpay_signature =
 * HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyRazorpayCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const k = keys();
  if (!k || !signature) return false;
  const expected = crypto.createHmac("sha256", k.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function notesValue(notes: unknown, key: string): string | null {
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) return null;
  const value = (notes as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}
