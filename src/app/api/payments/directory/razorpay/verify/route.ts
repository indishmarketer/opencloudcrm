import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rateLimit";
import { captureRazorpayPayment, fetchRazorpayOrder, fetchRazorpayPayment, verifyRazorpayCheckoutSignature } from "@/lib/razorpay";
import { getDirectoryListingOrder, settleDirectoryListingPayment } from "@/lib/directoryListingPayments";

const Schema = z.object({
  orderId: z.string().trim().regex(/^order_[A-Za-z0-9]{6,40}$/),
  paymentId: z.string().trim().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  signature: z.string().trim().regex(/^[a-f0-9]{64}$/),
}).strict();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  if (!(await consumeRateLimit(`directory-listing-verify:${session.userId}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many payment checks. Try again later." }, { status: 429 });
  }
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment details." }, { status: 400 });
  const { orderId, paymentId, signature } = parsed.data;
  if (!verifyRazorpayCheckoutSignature(orderId, paymentId, signature)) {
    return NextResponse.json({ error: "Payment signature did not verify." }, { status: 400 });
  }

  const listingOrder = await getDirectoryListingOrder("razorpay", orderId);
  if (!listingOrder || listingOrder.user_id !== session.userId) {
    return NextResponse.json({ error: "Order does not match this account." }, { status: 400 });
  }
  if (listingOrder.status === "paid") return NextResponse.json({ ok: true });

  try {
    const [providerOrder, fetchedPayment] = await Promise.all([fetchRazorpayOrder(orderId), fetchRazorpayPayment(paymentId)]);
    if (fetchedPayment.order_id !== orderId || providerOrder.amount !== listingOrder.amount_minor ||
        providerOrder.currency !== listingOrder.currency) {
      return NextResponse.json({ error: "Payment does not match this listing order." }, { status: 400 });
    }
    const payment = fetchedPayment.status === "authorized"
      ? await captureRazorpayPayment(paymentId, fetchedPayment.amount)
      : fetchedPayment;
    if (payment.status !== "captured" || !payment.captured) {
      return NextResponse.json({ error: "Payment is not complete yet." }, { status: 400 });
    }
    const outcome = await settleDirectoryListingPayment({
      provider: "razorpay",
      providerOrderId: orderId,
      paymentReference: paymentId,
      amountMinor: payment.amount,
      currency: payment.currency,
    });
    if (outcome === "paid" || outcome === "already_paid") return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "We could not match this payment to your listing. Contact support." }, { status: 400 });
  } catch (error) {
    console.error("Razorpay directory listing verification failed:", error);
    return NextResponse.json({ error: "We could not confirm the payment. If you were charged, contact support." }, { status: 502 });
  }
}
