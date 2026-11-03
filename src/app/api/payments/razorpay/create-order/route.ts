import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createRazorpayOrder, getRazorpayKeyId } from "@/lib/razorpay";
import { createRazorpayPurchaseToken } from "@/lib/razorpayPurchaseToken";
import { consumeRateLimit } from "@/lib/rateLimit";
import { getCoursePrices } from "@/lib/currency";
import { chargeAmount } from "@/lib/priceQuote";
import { attachProviderOrderId, discardOrder, findReusableOrder, reserveOrder, userHasPro } from "@/lib/paymentOrders";

const BodySchema = z.object({
  courseId: z.number().int().positive(),
  quote: z.string().max(1000).optional(),
}).strict();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await consumeRateLimit(`razorpay-order:${session.userId}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many checkout attempts." }, { status: 429 });
  }

  const keyId = getRazorpayKeyId();
  if (!keyId) return NextResponse.json({ error: "Razorpay is not available right now." }, { status: 503 });

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

  // Razorpay always charges INR: the quoted figure the buyer saw, else the
  // owner's INR price or the live conversion from USD.
  const priceInr = chargeAmount("INR", course.id, await getCoursePrices(course), parsed.data.quote);
  if (priceInr == null || !Number.isInteger(priceInr) || priceInr <= 0) {
    return NextResponse.json({ error: "This course has no price set." }, { status: 400 });
  }
  const amountPaise = priceInr * 100;
  const purchase = { provider: "razorpay" as const, userId: session.userId, courseId: course.id, amountMinor: amountPaise, currency: "INR" as const };
  const respond = (orderId: string) =>
    NextResponse.json({ keyId, orderId, amount: amountPaise, currency: "INR", courseTitle: course.title });

  // Double clicks, retries and a second tab get the same order, which
  // Razorpay lets the buyer pay only once.
  const existing = await findReusableOrder(purchase);
  if (existing?.providerOrderId) return respond(existing.providerOrderId);

  const reserved = await reserveOrder(purchase);
  const purchaseToken = await createRazorpayPurchaseToken({
    userId: session.userId,
    courseId: course.id,
    amountPaise,
    currency: "INR",
  });
  try {
    const order = await createRazorpayOrder({
      amountPaise,
      receipt: `po${reserved.id}`,
      notes: { purchase_token: purchaseToken, course_id: String(course.id), user_id: String(session.userId) },
    });
    await attachProviderOrderId(reserved.id, order.id);
    return respond(order.id);
  } catch (e) {
    await discardOrder(reserved.id);
    console.error("Razorpay order creation failed:", e);
    return NextResponse.json(
      { error: "We couldn't reach Razorpay to start checkout. Please try again." },
      { status: 502 },
    );
  }
}
