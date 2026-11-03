import { SignJWT, jwtVerify } from "jose";
import { getSessionSecret } from "@/lib/auth";

const secret = () => new TextEncoder().encode(getSessionSecret());

export type OpenTokenPayload = {
  deliveryId: number | null;
  email: string;
  templateKey: string | null;
  category: string;
};

/** No expiry -- an open-tracking pixel needs to keep working for as long as
 * the email itself might sit unread in an inbox (weeks, realistically). */
export async function createEmailOpenToken(payload: OpenTokenPayload): Promise<string> {
  return new SignJWT({
    purpose: "email-open",
    deliveryId: payload.deliveryId,
    email: payload.email.toLowerCase(),
    templateKey: payload.templateKey,
    category: payload.category,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(secret());
}

export async function verifyEmailOpenToken(token: string): Promise<OpenTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "email-open" || typeof payload.email !== "string") return null;
    return {
      deliveryId: Number.isInteger(payload.deliveryId) ? Number(payload.deliveryId) : null,
      email: payload.email,
      templateKey: typeof payload.templateKey === "string" ? payload.templateKey : null,
      category: typeof payload.category === "string" ? payload.category : "unknown",
    };
  } catch {
    return null;
  }
}

export async function createEmailClickToken(deliveryId: number, target: string): Promise<string> {
  return new SignJWT({ purpose: "email-click", deliveryId, target })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(secret());
}

export async function verifyEmailClickToken(token: string): Promise<{ deliveryId: number; target: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "email-click" || !Number.isInteger(payload.deliveryId) || typeof payload.target !== "string") {
      return null;
    }
    const target = new URL(payload.target);
    if (target.protocol !== "https:" && target.protocol !== "http:") return null;
    return { deliveryId: Number(payload.deliveryId), target: target.toString() };
  } catch {
    return null;
  }
}

/** 1x1 transparent GIF, injected as a hidden <img> into tracked emails. */
export const TRACKING_PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7",
  "base64"
);
