import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendMetaEvent, MetaEventName } from "@/lib/metaCapi";

// No "Purchase": that is sent server-side when a payment is verified
// (src/lib/coursePurchaseGrant.ts), so nobody can post fake purchases here.
const ALLOWED_EVENTS: MetaEventName[] = ["ViewContent", "InitiateCheckout", "AddPaymentInfo", "Lead"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const eventName = body?.eventName as string | undefined;
  const eventId = body?.eventId as string | undefined;
  const eventSourceUrl = body?.eventSourceUrl as string | undefined;

  if (!eventName || !ALLOWED_EVENTS.includes(eventName as MetaEventName) || !eventId || !eventSourceUrl) {
    return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  }

  const session = await getSession();
  const ip = req.headers.get("cf-connecting-ip") || undefined;
  const userAgent = req.headers.get("user-agent") || undefined;
  const fbp = req.cookies.get("_fbp")?.value;
  const fbc = req.cookies.get("_fbc")?.value;

  await sendMetaEvent({
    eventName: eventName as MetaEventName,
    eventId,
    eventSourceUrl,
    ip,
    userAgent,
    fbp,
    fbc,
    email: session?.email,
    externalId: session?.userId,
    customData: body?.customData,
  });

  return NextResponse.json({ ok: true });
}
