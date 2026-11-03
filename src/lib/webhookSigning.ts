import crypto from "node:crypto";

/** HMAC-SHA256 over `${timestamp}.${rawBody}`, same shape as the site's own
 * inbound webhook receiver (src/app/api/webhooks/[slug]/route.ts) so the
 * pattern is consistent for anyone reading both. A receiving system verifies
 * by recomputing this exact string with the shared secret. */
export function signWebhookBody(secret: string, timestamp: string, rawBody: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  const expected = signWebhookBody(secret, timestamp, rawBody);
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function generateSigningSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function maskSecret(secret: string): string {
  if (secret.length <= 4) return "••••";
  return `${"•".repeat(Math.max(secret.length - 4, 4))}${secret.slice(-4)}`;
}
