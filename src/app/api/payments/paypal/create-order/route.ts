import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createPaypalOrder } from "@/lib/paypal";
import { getCoursePrices } from "@/lib/currency";
import { chargeAmount } from "@/lib/priceQuote";
import { createPaypalPurchaseToken } from "@/lib/paypalPurchaseToken";
import { consumeRateLimit } from "@/lib/rateLimit";
import { attachProviderOrderId, discardOrder, findReusableOrder, reserveOrder, userHasPro } from "@/lib/paymentOrders";

const BodySchema = z.object({
  courseId: z.number().int().positive(),
  quote: z.string().max(1000).optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().regex(/^\d{4,15}$/).optional(),
}).strict();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await consumeRateLimit(`paypal-order:${session.userId}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many checkout attempts." }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid course." }, { status: 400 });

  const result = await pool.query(
    "SELECT id, title, price, price_currency FROM courses WHERE id = $1 AND published = true",
    [parsed.data.courseId],
  );
  const course = result.rows[0];
  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  if (await userHasPro(session.userId, course.id)) {
    return NextResponse.json({ error: "You already have full access to this course." }, { status: 409 });
  }

  // PayPal always charges USD: the quoted figure the buyer saw, else the
  // owner's USD price or the live conversion from INR.
  const priceUsd = chargeAmount("USD", course.id, await getCoursePrices(course), parsed.data.quote);
  if (priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0) {
    return NextResponse.json({ error: "This course has no price set." }, { status: 400 });
  }
  const amountCents = Math.round(priceUsd * 100);
  const purchase = { provider: "paypal" as const, userId: session.userId, courseId: course.id, amountMinor: amountCents, currency: "USD" as const };

  const existing = await findReusableOrder(purchase);
  if (existing?.providerOrderId) return NextResponse.json({ orderId: existing.providerOrderId });

  const reserved = await reserveOrder(purchase);
  const purchaseToken = createPaypalPurchaseToken({
    userId: session.userId,
    courseId: course.id,
    amountCents,
    currency: "USD",
  });
  try {
    const orderId = await createPaypalOrder({
      amountUsd: amountCents / 100,
      customId: purchaseToken,
      description: course.title,
      requestId: reserved.idempotencyKey,
      payerEmail: parsed.data.email || null,
      payerPhone: parsed.data.phone || null,
    });
    await attachProviderOrderId(reserved.id, orderId);
    return NextResponse.json({ orderId });
  } catch (e) {
    await discardOrder(reserved.id);
    console.error("PayPal order creation failed:", e);
    return NextResponse.json(
      { error: "We couldn't reach PayPal to start checkout. Please try again." },
      { status: 502 },
    );
  }
}
