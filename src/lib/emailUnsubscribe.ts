import { SignJWT, jwtVerify } from "jose";
import { getSessionSecret } from "@/lib/auth";

const secret = () => new TextEncoder().encode(getSessionSecret());

/** No expiry -- same reasoning as the newsletter-specific token this
 * generalizes: an unsubscribe link needs to keep working indefinitely,
 * and unsubscribing is idempotent and low-stakes. */
export async function createUnsubscribeToken(email: string): Promise<string> {
  return new SignJWT({ purpose: "email-unsubscribe", email: email.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(secret());
}

export async function verifyUnsubscribeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "email-unsubscribe" || typeof payload.email !== "string") return null;
    return payload.email;
  } catch {
    return null;
  }
}
