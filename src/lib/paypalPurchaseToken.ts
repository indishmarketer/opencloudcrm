import crypto from "node:crypto";
import { getSessionSecret } from "@/lib/sessionSecret";

export type PaypalPurchase = {
  userId: number;
  courseId: number;
  amountCents: number;
  currency: "USD";
};

export function createPaypalPurchaseToken(purchase: PaypalPurchase): string {
  const payload = Buffer.from(JSON.stringify({
    u: purchase.userId,
    c: purchase.courseId,
    a: purchase.amountCents,
    e: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyPaypalPurchaseToken(token: unknown): PaypalPurchase | null {
  if (typeof token !== "string" || !token) return null;
  try {
    const [encoded, suppliedSignature, extra] = token.split(".");
    if (!encoded || !suppliedSignature || extra) return null;
    const expected = crypto.createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
    if (suppliedSignature.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
    if (!Number.isInteger(payload.u) || !Number.isInteger(payload.c) ||
        !Number.isInteger(payload.a) || (payload.a as number) <= 0 ||
        typeof payload.e !== "number" || payload.e < Math.floor(Date.now() / 1000)) return null;
    return {
      userId: payload.u as number,
      courseId: payload.c as number,
      amountCents: payload.a as number,
      currency: "USD",
    };
  } catch {
    return null;
  }
}
