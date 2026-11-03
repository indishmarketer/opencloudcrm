import { jwtVerify, SignJWT } from "jose";
import { getSessionSecret } from "@/lib/sessionSecret";

const secret = () => new TextEncoder().encode(getSessionSecret());

export async function createNewsletterTrackingToken(
  purpose: "newsletter-click" | "newsletter-open",
  sendId: number,
  target?: string,
): Promise<string> {
  return new SignJWT({ purpose, sendId, ...(target ? { target } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secret());
}

export async function verifyNewsletterTrackingToken(
  token: string | null,
  purpose: "newsletter-click" | "newsletter-open",
): Promise<{ sendId: number; target?: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== purpose || !Number.isInteger(payload.sendId)) return null;
    if (payload.target !== undefined && typeof payload.target !== "string") return null;
    return { sendId: payload.sendId as number, target: payload.target as string | undefined };
  } catch {
    return null;
  }
}
