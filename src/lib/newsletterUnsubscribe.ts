import { SignJWT, jwtVerify } from "jose";
import { getSessionSecret } from "@/lib/auth";

const secret = () => new TextEncoder().encode(getSessionSecret());

/** No expiry -- this link needs to keep working for as long as someone stays
 * subscribed, which could be years. Unsubscribing is idempotent and low-
 * stakes, so a long-lived token is the right tradeoff here (unlike password
 * reset/magic-link tokens, which are short and single-use). */
export async function createUnsubscribeToken(subscriberId: number): Promise<string> {
  return new SignJWT({ purpose: "newsletter-unsubscribe", subscriberId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(secret());
}

export async function verifyUnsubscribeToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "newsletter-unsubscribe" || typeof payload.subscriberId !== "number") return null;
    return payload.subscriberId;
  } catch {
    return null;
  }
}
