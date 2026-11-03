import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { capturePaypalOrder } from "@/lib/paypal";
import { verifyPaypalPurchaseToken } from "@/lib/paypalPurchaseToken";
import { conversionClientFrom, grantCoursePurchase } from "@/lib/coursePurchaseGrant";
import { consumeRateLimit } from "@/lib/rateLimit";
import { resolvePurchase } from "@/lib/paymentOrders";

const BodySchema = z.object({
  orderId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/),
}).strict();

/** Called by the PayPal buttons' onApprove, while the buyer waits on our
 * page. Grants access synchronously; the webhook is the fallback. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await consumeRateLimit(`paypal-capture:${session.userId}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many checkout attempts." }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid order." }, { status: 400 });

  let capture;
  try {
    capture = await capturePaypalOrder(parsed.data.orderId);
  } catch (e) {
    console.error("PayPal capture failed:", e);
    return NextResponse.json(
      { error: "We couldn't confirm your payment with PayPal. If you were charged, contact support and we'll sort it out." },
      { status: 502 },
    );
  }
  if (capture.status !== "COMPLETED" || !capture.captureId) {
    return NextResponse.json({ error: "Payment not completed." }, { status: 400 });
  }

  const token = verifyPaypalPurchaseToken(capture.customId);
  const purchase = await resolvePurchase(
    "paypal",
    parsed.data.orderId,
    token && { userId: token.userId, courseId: token.courseId, expectedMinor: token.amountCents, expectedCurrency: token.currency },
  );
  if (!purchase || purchase.userId !== session.userId) {
    return NextResponse.json({ error: "Order does not match this account." }, { status: 400 });
  }

  const result = await grantCoursePurchase({
    method: "paypal",
    reference: capture.captureId,
    userId: purchase.userId,
    courseId: purchase.courseId,
    paidMinor: capture.amount && /^\d+(?:\.\d{1,2})?$/.test(capture.amount) ? Math.round(Number(capture.amount) * 100) : null,
    paidCurrency: capture.currency,
    expectedMinor: purchase.expectedMinor,
    expectedCurrency: purchase.expectedCurrency,
    client: conversionClientFrom(req),
    providerOrderId: parsed.data.orderId,
    phone: capture.payerPhone,
  });

  if (result === "granted" || result === "already_recorded") {
    const course = await pool.query("SELECT slug FROM courses WHERE id = $1", [purchase.courseId]);
    return NextResponse.json({ ok: true, courseSlug: course.rows[0]?.slug ?? null });
  }
  if (result === "failed") {
    return NextResponse.json(
      { error: "Payment succeeded but we couldn't finish setting up your access. We've been notified and will fix this shortly." },
      { status: 500 },
    );
  }
  return NextResponse.json({ error: "We couldn't match this payment to the course. Contact support and we'll sort it out." }, { status: 400 });
}
