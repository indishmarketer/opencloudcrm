import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  captureRazorpayPayment,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  notesValue,
  verifyRazorpayCheckoutSignature,
} from "@/lib/razorpay";
import { conversionClientFrom, grantCoursePurchase } from "@/lib/coursePurchaseGrant";
import { verifyRazorpayPurchaseToken } from "@/lib/razorpayPurchaseToken";
import { consumeRateLimit } from "@/lib/rateLimit";
import { resolvePurchase } from "@/lib/paymentOrders";

const BodySchema = z.object({
  orderId: z.string().trim().regex(/^order_[A-Za-z0-9]{6,40}$/),
  paymentId: z.string().trim().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  signature: z.string().trim().regex(/^[a-f0-9]{64}$/),
}).strict();

const CONTACT_SUPPORT = "If you were charged, contact support and we'll sort it out.";

/** Called by checkout.js's success handler. Grants access synchronously so
 * the buyer lands on an unlocked course; the webhook is the fallback. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await consumeRateLimit(`razorpay-verify:${session.userId}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many checkout attempts." }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment details." }, { status: 400 });
  const { orderId, paymentId, signature } = parsed.data;

  if (!verifyRazorpayCheckoutSignature(orderId, paymentId, signature)) {
    return NextResponse.json({ error: "Payment signature did not verify." }, { status: 400 });
  }

  let order;
  let payment;
  try {
    [order, payment] = await Promise.all([fetchRazorpayOrder(orderId), fetchRazorpayPayment(paymentId)]);
    if (payment.order_id !== orderId) {
      return NextResponse.json({ error: "Payment does not belong to this order." }, { status: 400 });
    }
    if (payment.status === "authorized") payment = await captureRazorpayPayment(paymentId, payment.amount);
  } catch (e) {
    console.error("Razorpay verify could not load or capture payment:", e);
    return NextResponse.json({ error: `We couldn't confirm your payment with Razorpay. ${CONTACT_SUPPORT}` }, { status: 502 });
  }
  if (payment.status !== "captured") {
    return NextResponse.json({ error: "Payment not completed." }, { status: 400 });
  }

  const token = await verifyRazorpayPurchaseToken(notesValue(order.notes, "purchase_token"));
  const purchase = await resolvePurchase(
    "razorpay",
    orderId,
    token && { userId: token.userId, courseId: token.courseId, expectedMinor: token.amountPaise, expectedCurrency: token.currency },
  );
  if (!purchase || purchase.userId !== session.userId) {
    return NextResponse.json({ error: "Order does not match this account." }, { status: 400 });
  }

  const result = await grantCoursePurchase({
    method: "razorpay",
    reference: paymentId,
    userId: purchase.userId,
    courseId: purchase.courseId,
    paidMinor: payment.amount,
    paidCurrency: payment.currency,
    expectedMinor: purchase.expectedMinor,
    expectedCurrency: purchase.expectedCurrency,
    client: conversionClientFrom(req),
    providerOrderId: orderId,
    phone: payment.contact,
  });
  if (result === "granted" || result === "already_recorded") return NextResponse.json({ ok: true });
  if (result === "failed") {
    return NextResponse.json(
      { error: "Payment succeeded but we couldn't finish setting up your access. We've been notified and will fix this shortly." },
      { status: 500 },
    );
  }
  return NextResponse.json({ error: `We couldn't match this payment to the course. ${CONTACT_SUPPORT}` }, { status: 400 });
}
