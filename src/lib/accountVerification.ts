import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { createSession, safeRedirectPath } from "@/lib/auth";
import { sendMetaEvent } from "@/lib/metaCapi";
import { triggerEmailFlow, firstNameOf } from "@/lib/emailAutomation";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { emitVerifiedContactEvent } from "@/lib/verifiedContactEvent";
import { confirmContactDeliverable, confirmContactSubscribed } from "@/lib/contacts";
import { recordWhatsAppOptIn } from "@/lib/whatsappContacts";
import { SITE_URL } from "@/lib/liveSiteUrl";

/** Shared completion for a legacy account link, an OTP code, or its magic
 * link. The credential must have been consumed before this is called. */
export async function completeAccountVerification(
  req: NextRequest,
  userId: number,
  email: string,
  redirect: string | null | undefined,
): Promise<string> {
  const userRow = await pool.query<{ name: string | null; updates_opt_in: boolean; whatsapp_opt_in: boolean }>(
    "SELECT name, updates_opt_in, whatsapp_opt_in FROM users WHERE id = $1 AND lower(email) = lower($2)",
    [userId, email],
  );
  const user = userRow.rows[0];
  if (!user) throw new Error("Verification account no longer exists.");
  const destination = safeRedirectPath(redirect);
  await pool.query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1", [userId]);
  await confirmContactDeliverable(email).catch((error) => console.error("Contact deliverability update failed:", error));
  await createSession({ userId, email });
  if (user.updates_opt_in) await confirmContactSubscribed(email).catch((error) => console.error("Signup consent update failed:", error));
  await emitVerifiedContactEvent({ email, name: user.name, userId, source: "signup" }).catch((error) => console.error("Verified contact event failed:", error));
  if (user.whatsapp_opt_in) recordWhatsAppOptIn(email, "signup").catch(() => {});

  sendMetaEvent({
    eventName: "CompleteRegistration",
    eventId: crypto.randomUUID(),
    eventSourceUrl: `${SITE_URL}${destination}`,
    ip: req.headers.get("cf-connecting-ip") || undefined,
    userAgent: req.headers.get("user-agent") || undefined,
    fbp: req.cookies.get("_fbp")?.value,
    fbc: req.cookies.get("_fbc")?.value,
    email,
    externalId: userId,
  }).catch(() => {});
  triggerEmailFlow("user_signup_verified", email, { first_name: firstNameOf(user.name) }).catch(() => {});
  emitWebhookEvent({
    eventType: "user.verified", source: "users", sourceRecordId: userId,
    contactEmail: email, contactName: user.name, userId,
    data: { user_id: userId, email },
  }).catch(() => {});
  return destination;
}
