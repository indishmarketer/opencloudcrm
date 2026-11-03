import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rateLimit";
import { getCheckoutRegion } from "@/lib/checkoutRegion";
import { getDirectoryListingPrice } from "@/lib/directoryListingPrice";
import { chargeAmount } from "@/lib/priceQuote";
import { createRazorpayOrder, getRazorpayKeyId } from "@/lib/razorpay";
import {
  attachDirectoryListingProviderOrder,
  expireDirectoryListingOrder,
  isPayableListingStatus,
  reserveDirectoryListingOrder,
} from "@/lib/directoryListingPayments";

const Schema = z.object({ toolId: z.number().int().positive(), quote: z.string().max(1000).optional() }).strict();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  if (!(await consumeRateLimit(`directory-listing-razorpay:${session.userId}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many checkout attempts." }, { status: 429 });
  }
  if ((await getCheckoutRegion(session.userId)).method !== "razorpay") {
    return NextResponse.json({ error: "Razorpay is not the payment method available for your account." }, { status: 400 });
  }
  const keyId = getRazorpayKeyId();
  if (!keyId) return NextResponse.json({ error: "Razorpay is not available right now." }, { status: 503 });
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
  const { prices } = await getDirectoryListingPrice();
  const rupees = chargeAmount("INR", tool.id, prices, parsed.data.quote);
  if (rupees == null || !Number.isInteger(rupees) || rupees <= 0) {
    return NextResponse.json({ error: "Could not determine the INR price. Please try again." }, { status: 503 });
  }
  const amountPaise = rupees * 100;
  const reserved = await reserveDirectoryListingOrder({
    toolId: tool.id,
    userId: session.userId,
    provider: "razorpay",
    amountMinor: amountPaise,
    currency: "INR",
  });
  if (reserved.state === "paid") return NextResponse.json({ error: "This listing is already paid." }, { status: 409 });
  if (reserved.state === "busy") return NextResponse.json({ error: "Checkout is already starting. Please wait a moment and try again." }, { status: 409 });
  if (reserved.state === "reuse") {
    return NextResponse.json({ keyId, orderId: reserved.order.provider_order_id, amount: reserved.order.amount_minor, currency: reserved.order.currency });
  }

  try {
    const order = await createRazorpayOrder({
      amountPaise,
      receipt: `dl${reserved.order.id}`,
      notes: { directory_listing_order_id: reserved.order.id, tool_id: String(tool.id), user_id: String(session.userId) },
    });
    await attachDirectoryListingProviderOrder(reserved.order.id, order.id);
    return NextResponse.json({ keyId, orderId: order.id, amount: amountPaise, currency: "INR", toolName: tool.name });
  } catch (error) {
    await expireDirectoryListingOrder(reserved.order.id);
    console.error("Razorpay directory listing order failed:", error);
    return NextResponse.json({ error: "We could not reach Razorpay to start checkout. Please try again." }, { status: 502 });
  }
}
