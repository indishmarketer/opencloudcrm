import crypto from "node:crypto";
import { pool } from "@/lib/db";

export type PaymentProvider = "razorpay" | "paypal";

export type PaymentOrder = {
  id: number;
  provider: PaymentProvider;
  providerOrderId: string | null;
  idempotencyKey: string;
  userId: number;
  courseId: number;
  amountMinor: number;
  currency: "INR" | "USD";
  status: "created" | "paid";
};

/** A pending order younger than this is reused instead of creating another
 * one, so double clicks, retries and second tabs share one order. */
const REUSE_WINDOW_MINUTES = 30;

function toOrder(row: Record<string, unknown>): PaymentOrder {
  return {
    id: Number(row.id),
    provider: row.provider as PaymentProvider,
    providerOrderId: (row.provider_order_id as string | null) ?? null,
    idempotencyKey: String(row.idempotency_key),
    userId: Number(row.user_id),
    courseId: Number(row.course_id),
    amountMinor: Number(row.amount_minor),
    currency: row.currency as "INR" | "USD",
    status: row.status as "created" | "paid",
  };
}

export async function userHasPro(userId: number, courseId: number): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM course_enrollments WHERE user_id = $1 AND course_id = $2 AND tier = 'pro'",
    [userId, courseId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Returns a recent unpaid order for exactly this purchase, if any. */
export async function findReusableOrder(input: {
  provider: PaymentProvider;
  userId: number;
  courseId: number;
  amountMinor: number;
  currency: "INR" | "USD";
}): Promise<PaymentOrder | null> {
  const result = await pool.query(
    `SELECT * FROM payment_orders
     WHERE provider = $1 AND user_id = $2 AND course_id = $3 AND amount_minor = $4 AND currency = $5
       AND status = 'created' AND provider_order_id IS NOT NULL
       AND created_at > now() - make_interval(mins => $6)
     ORDER BY created_at DESC LIMIT 1`,
    [input.provider, input.userId, input.courseId, input.amountMinor, input.currency, REUSE_WINDOW_MINUTES],
  );
  return result.rows[0] ? toOrder(result.rows[0]) : null;
}

/** Reserves an order row before calling the provider; its idempotency key
 * is sent to PayPal as PayPal-Request-Id. */
export async function reserveOrder(input: {
  provider: PaymentProvider;
  userId: number;
  courseId: number;
  amountMinor: number;
  currency: "INR" | "USD";
}): Promise<PaymentOrder> {
  const result = await pool.query(
    `INSERT INTO payment_orders (provider, idempotency_key, user_id, course_id, amount_minor, currency)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.provider, crypto.randomUUID(), input.userId, input.courseId, input.amountMinor, input.currency],
  );
  return toOrder(result.rows[0]);
}

export async function attachProviderOrderId(id: number, providerOrderId: string): Promise<void> {
  await pool.query("UPDATE payment_orders SET provider_order_id = $2 WHERE id = $1", [id, providerOrderId]);
}

export async function discardOrder(id: number): Promise<void> {
  await pool.query("DELETE FROM payment_orders WHERE id = $1 AND provider_order_id IS NULL", [id]);
}

export async function findOrderByProviderId(provider: PaymentProvider, providerOrderId: string): Promise<PaymentOrder | null> {
  const result = await pool.query(
    "SELECT * FROM payment_orders WHERE provider = $1 AND provider_order_id = $2",
    [provider, providerOrderId],
  );
  return result.rows[0] ? toOrder(result.rows[0]) : null;
}

export async function markOrderPaid(provider: PaymentProvider, providerOrderId: string, paymentReference: string): Promise<void> {
  await pool.query(
    `UPDATE payment_orders SET status = 'paid', paid_at = COALESCE(paid_at, now()), payment_reference = $3
     WHERE provider = $1 AND provider_order_id = $2`,
    [provider, providerOrderId, paymentReference],
  );
}

export type ResolvedPurchase = {
  userId: number;
  courseId: number;
  expectedMinor: number;
  expectedCurrency: "INR" | "USD";
};

/** Who bought what for a provider order: the stored order row first (it
 * never expires, so webhooks retried days later still match), then the
 * signed purchase token for orders made before payment_orders existed. */
export async function resolvePurchase(
  provider: PaymentProvider,
  providerOrderId: string | null,
  fromToken: ResolvedPurchase | null,
): Promise<ResolvedPurchase | null> {
  if (providerOrderId) {
    const order = await findOrderByProviderId(provider, providerOrderId);
    if (order) {
      return { userId: order.userId, courseId: order.courseId, expectedMinor: order.amountMinor, expectedCurrency: order.currency };
    }
  }
  return fromToken;
}
