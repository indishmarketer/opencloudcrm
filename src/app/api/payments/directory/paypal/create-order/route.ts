import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getCheckoutRegion, accountPhone } from "@/lib/checkoutRegion";
import { getPaypalClientId, createPaypalOrder } from "@/lib/paypal";
import { consumeRateLimit } from "@/lib/rateLimit";
import { getDirectoryListingPrice } from "@/lib/directoryListingPrice";
import { SITE_NAME } from "@/config/brand";
import {
  attachDirectoryListingProviderOrder,
  expireDirectoryListingOrder,
  isPayableListingStatus,
  reserveDirectoryListingOrder,
} from "@/lib/directoryListingPayments";

const Schema = z.object({ toolId: z.number().int().positive() }).strict();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  if (!(await consumeRateLimit(`directory-listing-paypal:${session.userId}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many checkout attempts." }, { status: 429 });
  }
  if ((await getCheckoutRegion(session.userId)).method !== "paypal") {
    return NextResponse.json({ error: "PayPal is not the payment method available for your account." }, { status: 400 });
  }
  if (!getPaypalClientId()) return NextResponse.json({ error: "PayPal is not available right now." }, { status: 503 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid listing." }, { status: 400 });

  const result = await pool.query(
    `SELECT id, name, status, listing_tier, paid_at
     FROM directory_tools WHERE id = $1 AND submitted_by_user_id = $2`,
    [parsed.data.toolId, session.userId],
  );
  const tool = result.rows[0];
  if (!tool || tool.listing_tier !== "paid") return NextResponse.json({ error: "Paid listing not found." }, { status: 404 });
  if (tool.paid_at) return NextResponse.json({ error: "This listing is already paid." }, { status: 409 });
  if (!isPayableListingStatus(tool.status)) {
    return NextResponse.json({ error: "This listing cannot be paid for right now." }, { status: 409 });
  }

  // The fee is whatever the console says, never anything from the request.
  const { usd } = await getDirectoryListingPrice();
  const reserved = await reserveDirectoryListingOrder({
    toolId: tool.id,
    userId: session.userId,
    provider: "paypal",
    amountMinor: usd * 100,
    currency: "USD",
  });
  if (reserved.state === "paid") return NextResponse.json({ error: "This listing is already paid." }, { status: 409 });
  if (reserved.state === "busy") return NextResponse.json({ error: "Checkout is already starting. Please wait a moment and try again." }, { status: 409 });
  if (reserved.state === "reuse") return NextResponse.json({ orderId: reserved.order.provider_order_id });

  try {
    const orderId = await createPaypalOrder({
      amountUsd: usd,
      customId: `directory-listing:${reserved.order.id}`,
      description: `${SITE_NAME} directory listing: ${tool.name}`,
      requestId: `directory-listing-${reserved.order.id}`,
      payerEmail: session.email,
      payerPhone: await accountPhone(session.userId),
    });
    await attachDirectoryListingProviderOrder(reserved.order.id, orderId);
    return NextResponse.json({ orderId });
  } catch (error) {
    await expireDirectoryListingOrder(reserved.order.id);
    console.error("PayPal directory listing order failed:", error);
    return NextResponse.json({ error: "We could not reach PayPal to start checkout. Please try again." }, { status: 502 });
  }
}
