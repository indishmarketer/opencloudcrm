import { NextRequest, NextResponse } from "next/server";
import { handleRefund, handleDispute } from "@/lib/paymentRefunds";
import { verifyPaypalWebhookSignature } from "@/lib/paypal";
import { verifyPaypalPurchaseToken } from "@/lib/paypalPurchaseToken";
import { grantCoursePurchase } from "@/lib/coursePurchaseGrant";
import { resolvePurchase } from "@/lib/paymentOrders";
import { raiseAlert } from "@/lib/systemAlerts";
import { getDirectoryListingOrder, settleDirectoryListingPayment } from "@/lib/directoryListingPayments";

export async function POST(req: NextRequest) {
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > 256 * 1024) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody) > 256 * 1024) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const verified = await verifyPaypalWebhookSignature(
    {
      transmissionId: req.headers.get("paypal-transmission-id"),
      transmissionTime: req.headers.get("paypal-transmission-time"),
      certUrl: req.headers.get("paypal-cert-url"),
      authAlgo: req.headers.get("paypal-auth-algo"),
      transmissionSig: req.headers.get("paypal-transmission-sig"),
    },
    body
  );
  if (!verified) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });

  // Needs PAYMENT.CAPTURE.REFUNDED, PAYMENT.CAPTURE.REVERSED and
  // CUSTOMER.DISPUTE.CREATED subscribed on the webhook in the PayPal dashboard.
  const res = body.resource && typeof body.resource === "object" ? (body.resource as Record<string, unknown>) : {};
  if (body.event_type === "PAYMENT.CAPTURE.REFUNDED" || body.event_type === "PAYMENT.CAPTURE.REVERSED") {
    // The refund resource links back to its capture ("up"); a reversal is
    // the capture itself.
    const links = Array.isArray(res.links) ? (res.links as { rel?: unknown; href?: unknown }[]) : [];
    const up = links.find((l) => l.rel === "up" && typeof l.href === "string");
    const captureRef = body.event_type === "PAYMENT.CAPTURE.REVERSED"
      ? (typeof res.id === "string" ? res.id : null)
      : (typeof up?.href === "string" ? up.href.split("/").pop() || null : null);
    const refundId = typeof res.id === "string" ? res.id : null;
    if (!captureRef || !refundId) return NextResponse.json({ ok: true, skipped: "refund without ids" });
    const amount = res.amount && typeof res.amount === "object" ? Number((res.amount as { value?: unknown }).value) : NaN;
    const breakdown = res.seller_payable_breakdown && typeof res.seller_payable_breakdown === "object"
      ? (res.seller_payable_breakdown as { total_refunded_amount?: { value?: unknown } }).total_refunded_amount?.value
      : undefined;
    const outcome = await handleRefund({
      method: "paypal",
      reference: captureRef,
      refundId: `${body.event_type}:${refundId}`,
      amount: Number.isFinite(amount) ? amount : null,
      totalRefunded: typeof breakdown === "string" && Number.isFinite(Number(breakdown)) ? Number(breakdown)
        : body.event_type === "PAYMENT.CAPTURE.REVERSED" && Number.isFinite(amount) ? amount : null,
    });
    return NextResponse.json({ ok: true, refund: outcome });
  }
  if (body.event_type === "CUSTOMER.DISPUTE.CREATED") {
    const transactions = Array.isArray(res.disputed_transactions)
      ? (res.disputed_transactions as { seller_transaction_id?: unknown }[])
      : [];
    const captureRef = transactions.map((t) => t.seller_transaction_id).find((id): id is string => typeof id === "string");
    const disputeId = typeof res.dispute_id === "string" ? res.dispute_id : null;
    if (!captureRef || !disputeId) return NextResponse.json({ ok: true, skipped: "dispute without ids" });
    await handleDispute({ method: "paypal", reference: captureRef, disputeId, reason: typeof res.reason === "string" ? res.reason : null });
    return NextResponse.json({ ok: true });
  }

  if (body.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    return NextResponse.json({ ok: true, skipped: "irrelevant event" });
  }

  const resource = body.resource && typeof body.resource === "object"
    ? body.resource as {
        id?: unknown;
        custom_id?: unknown;
        amount?: { value?: unknown; currency_code?: unknown };
        supplementary_data?: { related_ids?: { order_id?: unknown } };
      }
    : {};
  const captureId = typeof resource.id === "string" ? resource.id : undefined;
  const orderId = typeof resource.supplementary_data?.related_ids?.order_id === "string"
    ? resource.supplementary_data.related_ids.order_id
    : null;
  if (captureId && orderId) {
    const listingOrder = await getDirectoryListingOrder("paypal", orderId);
    if (listingOrder) {
      const amountValue = resource.amount?.value;
      const amountMinor = typeof amountValue === "string" && /^\d+(?:\.\d{1,2})?$/.test(amountValue)
        ? Math.round(Number(amountValue) * 100)
        : 0;
      const outcome = await settleDirectoryListingPayment({
        provider: "paypal",
        providerOrderId: orderId,
        paymentReference: captureId,
        amountMinor,
        currency: typeof resource.amount?.currency_code === "string" ? resource.amount.currency_code : null,
      });
      if (outcome === "mismatch") return NextResponse.json({ error: "Directory listing amount or order mismatch." }, { status: 400 });
      if (outcome === "unmatched") return NextResponse.json({ error: "Directory listing order not found." }, { status: 404 });
      return NextResponse.json({ ok: true, result: outcome });
    }
  }
  // payment_orders first (never expires, so a webhook PayPal retries days
  // later still matches), then the 2h signed token for older orders.
  const token = verifyPaypalPurchaseToken(resource.custom_id);
  const purchase = await resolvePurchase(
    "paypal",
    orderId,
    token && { userId: token.userId, courseId: token.courseId, expectedMinor: token.amountCents, expectedCurrency: token.currency },
  );

  if (!captureId || !purchase) {
    // Money moved but we can't tell whose it is: never skip silently.
    await raiseAlert({
      kind: "payment_unmatched",
      dedupeKey: `payment_unmatched:paypal:${captureId || orderId || Date.now()}`,
      severity: "critical",
      title: `PayPal payment ${captureId || "(no id)"} could not be matched to an account`,
      detail: `PayPal order ${orderId || "unknown"}. Look it up in PayPal, find the buyer and grant access by hand, then mark this resolved.`,
      link: "/console/courses/students",
    });
    return NextResponse.json({ ok: true, skipped: "could not match user/course, owner alerted" });
  }

  // capture-order (on our page, while the buyer waits) normally grants
  // access first; this webhook is the fallback. The shared grant dedupes on
  // the capture id.
  const amountValue = resource.amount?.value;
  const result = await grantCoursePurchase({
    method: "paypal",
    reference: captureId,
    userId: purchase.userId,
    courseId: purchase.courseId,
    paidMinor: typeof amountValue === "string" && /^\d+(?:\.\d{1,2})?$/.test(amountValue)
      ? Math.round(Number(amountValue) * 100)
      : null,
    paidCurrency: typeof resource.amount?.currency_code === "string" ? resource.amount.currency_code : null,
    expectedMinor: purchase.expectedMinor,
    expectedCurrency: purchase.expectedCurrency,
    providerOrderId: orderId,
  });
  if (result === "failed") {
    return NextResponse.json({ ok: false, error: "enrollment transaction failed, owner alerted" }, { status: 500 });
  }
  if (result === "mismatch") {
    return NextResponse.json({ error: "Payment amount does not match the signed order." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result });
}
