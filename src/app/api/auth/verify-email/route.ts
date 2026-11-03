import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyEmailVerificationToken, createSession, safeRedirectPath, isSameOriginPost } from "@/lib/auth";
import { sendMetaEvent } from "@/lib/metaCapi";
import { triggerEmailFlow, firstNameOf } from "@/lib/emailAutomation";
import { emitWebhookEvent } from "@/lib/webhookEvents";
import { confirmContactDeliverable, confirmContactSubscribed } from "@/lib/contacts";
import { recordWhatsAppOptIn } from "@/lib/whatsappContacts";
import { SITE_URL } from "@/config/brand";

/** Opening the emailed link only shows a confirm button. Mail security
 * scanners fetch links before people click them, and a GET that used the
 * token would spend it (and sign the scanner in). The button POSTs here. */
export async function GET(req: NextRequest) {
  const params = new URLSearchParams();
  params.set("token", req.nextUrl.searchParams.get("token") || "");
  params.set("redirect", safeRedirectPath(req.nextUrl.searchParams.get("redirect")));
  return NextResponse.redirect(new URL(`/verify-email?${params}`, SITE_URL));
}

export async function POST(req: NextRequest) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") || "");
  const redirect = safeRedirectPath(String(form?.get("redirect") || ""));

  const verified = token ? await verifyEmailVerificationToken(token) : null;
  if (!verified) {
    return NextResponse.redirect(new URL("/login?error=verification_expired", SITE_URL), 303);
  }

  await pool.query(
    "UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1",
    [verified.userId]
  );
  // Clicking this link just proved the inbox is real and receiving mail --
  // overrides any stale bounced/invalid classification from earlier.
  confirmContactDeliverable(verified.email).catch(() => {});

  await createSession({ userId: verified.userId, email: verified.email });

  const userRow = await pool.query("SELECT name, updates_opt_in, whatsapp_opt_in FROM users WHERE id = $1", [verified.userId]);
  const vars = { first_name: firstNameOf(userRow.rows[0]?.name) };
  // Deferred to verification (like account activation itself) so a
  // mistyped/someone-else's email at signup never gets marked subscribed.
  if (userRow.rows[0]?.updates_opt_in) confirmContactSubscribed(verified.email).catch(() => {});
  // Same deferral for WhatsApp, for the same reason: the two checkboxes at
  // signup are answered before anyone has proved the address is theirs.
  if (userRow.rows[0]?.whatsapp_opt_in) recordWhatsAppOptIn(verified.email, "signup").catch(() => {});

  sendMetaEvent({
    eventName: "CompleteRegistration",
    eventId: crypto.randomUUID(),
    eventSourceUrl: `${SITE_URL}${redirect}`,
    ip: req.headers.get("cf-connecting-ip") || undefined,
    userAgent: req.headers.get("user-agent") || undefined,
    fbp: req.cookies.get("_fbp")?.value,
    fbc: req.cookies.get("_fbc")?.value,
    email: verified.email,
    externalId: verified.userId,
  }).catch(() => {});

  triggerEmailFlow("user_signup_verified", verified.email, vars).catch(() => {});

  emitWebhookEvent({
    eventType: "user.verified",
    source: "users",
    sourceRecordId: verified.userId,
    contactEmail: verified.email,
    contactName: userRow.rows[0]?.name || null,
    userId: verified.userId,
    data: { user_id: verified.userId, email: verified.email },
  }).catch(() => {});

  return NextResponse.redirect(new URL(redirect, SITE_URL), 303);
}
