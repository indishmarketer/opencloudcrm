import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rateLimit";
import { capturePaypalOrder } from "@/lib/paypal";
import { getDirectoryListingOrder, settleDirectoryListingPayment } from "@/lib/directoryListingPayments";

const Schema = z.object({ orderId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/) }).strict();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  if (!(await consumeRateLimit(`directory-listing-paypal-capture:${session.userId}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many payment checks. Try again later." }, { status: 429 });
  }
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  const order = await getDirectoryListingOrder("paypal", parsed.data.orderId);
  if (!order || order.user_id !== session.userId) {
    return NextResponse.json({ error: "Order does not match this account." }, { status: 400 });
  }
  if (order.status === "paid") return NextResponse.json({ ok: true });

  try {
    const capture = await capturePaypalOrder(parsed.data.orderId);
    if (capture.status !== "COMPLETED" || !capture.captureId) {
      return NextResponse.json({ error: "Payment is not complete yet." }, { status: 400 });
    }
    const amountMinor = capture.amount && /^\d+(?:\.\d{1,2})?$/.test(capture.amount)
      ? Math.round(Number(capture.amount) * 100)
      : 0;
    const outcome = await settleDirectoryListingPayment({
      provider: "paypal",
      providerOrderId: parsed.data.orderId,
      paymentReference: capture.captureId,
      amountMinor,
      currency: capture.currency,
    });
    if (outcome === "paid" || outcome === "already_paid") return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "We could not match this payment to your listing. Contact support." }, { status: 400 });
  } catch (error) {
    console.error("PayPal directory listing capture failed:", error);
    return NextResponse.json({ error: "We could not confirm the payment. If you were charged, contact support." }, { status: 502 });
  }
}
