import type { Pool, PoolClient } from "pg";
import { pool } from "@/lib/db";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp";

/** Ties WhatsApp numbers to contact records, and tracks who may be
 * messaged. Kept apart from whatsapp.ts (which only talks to Meta) so the
 * sending code has no opinion about consent, and this has no opinion about
 * HTTP. */

type Queryable = Pick<Pool | PoolClient, "query">;

export type WhatsAppStatus = "unknown" | "subscribed" | "unsubscribed";
/** Where a status came from. 'backfill' is migration 120's one-off: every
 * contact who already had an account when the WhatsApp checkbox was
 * introduced counts as subscribed, on the owner's decision, and this value
 * keeps that distinguishable from someone who actually ticked a box. */
export type WhatsAppStatusSource =
  | "signup"
  | "booking"
  | "checkout"
  | "webinar"
  | "reply_stop"
  | "reply_button"
  | "backfill"
  | "owner";

/** What someone has to send to stop marketing. Meta surfaces a block button
 * too, but people type these, so honour them. */
const OPT_OUT_WORDS = new Set(["stop", "unsubscribe", "cancel", "end", "quit", "optout", "opt-out"]);
const OPT_IN_WORDS = new Set(["start", "subscribe", "unstop", "optin", "opt-in"]);

export function isOptOutMessage(body: string | null | undefined): boolean {
  if (!body) return false;
  return OPT_OUT_WORDS.has(body.trim().toLowerCase().replace(/[.!]+$/, ""));
}

/** A tapped quick-reply button, which is matched loosely rather than
 * exactly: the label is ours, so it reads like "Unsubscribe from updates"
 * or "Stop these messages", and exact-word matching would ignore the one
 * opt-out route that is easiest for the customer to use. */
export function isOptOutButtonReply(title: string | null | undefined): boolean {
  if (!title) return false;
  return /\b(unsubscribe|stop|opt\s?-?out)\b/i.test(title);
}

export function isOptInMessage(body: string | null | undefined): boolean {
  if (!body) return false;
  return OPT_IN_WORDS.has(body.trim().toLowerCase().replace(/[.!]+$/, ""));
}

/** Finds the contact a WhatsApp number belongs to.
 *
 * Exact match first. The fallback compares the last 10 digits because the
 * same person can be stored with or without a country code depending on
 * where the number came from (a gateway hands back a local format, our own
 * form builds an E.164 one), and 10 digits is long enough to be specific
 * while covering the national-number length in every market we send to. */
export async function findContactByPhone(rawPhone: string): Promise<number | null> {
  const digits = normalizePhoneForWhatsApp(rawPhone);
  if (digits.length < 8) return null;

  const exact = await pool.query<{ id: string }>(
    "SELECT id FROM contacts WHERE phone = $1 LIMIT 1",
    [digits],
  );
  if (exact.rows[0]) return Number(exact.rows[0].id);

  const tail = digits.slice(-10);
  const suffix = await pool.query<{ id: string }>(
    `SELECT id FROM contacts WHERE phone IS NOT NULL AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1
     ORDER BY id LIMIT 2`,
    [tail],
  );
  // Only trust it when it is unambiguous; two contacts sharing a tail means
  // guessing, and attaching a conversation to the wrong person is worse
  // than leaving it unlinked.
  return suffix.rows.length === 1 ? Number(suffix.rows[0].id) : null;
}

export async function setWhatsAppStatus(
  contactId: number,
  status: WhatsAppStatus,
  source: WhatsAppStatusSource,
): Promise<void> {
  await pool.query(
    `UPDATE contacts SET whatsapp_status = $2, whatsapp_status_source = $3, whatsapp_status_at = now(), updated_at = now()
     WHERE id = $1`,
    [contactId, status, source],
  );
}

/** Same as setWhatsAppStatus, but leaves an existing opt-out alone, and
 * takes a client so it can run inside the transaction that created the
 * contact. Use this for anything driven by a form: ticking a box on a
 * booking form is not a reason to undo someone's earlier STOP. */
export async function setWhatsAppStatusIfNotOptedOut(
  contactId: number,
  status: WhatsAppStatus,
  source: WhatsAppStatusSource,
  db: Queryable = pool,
): Promise<void> {
  await db.query(
    `UPDATE contacts SET whatsapp_status = $2, whatsapp_status_source = $3, whatsapp_status_at = now(), updated_at = now()
     WHERE id = $1 AND whatsapp_status <> 'unsubscribed'`,
    [contactId, status, source],
  );
}

/** Records consent for a number that was just given to us, without ever
 * overriding a previous opt-out -- someone who sent STOP has to opt back in
 * deliberately, not by filling in a form that happens to collect a phone. */
export async function recordWhatsAppOptIn(
  email: string,
  source: WhatsAppStatusSource,
): Promise<void> {
  await pool.query(
    `UPDATE contacts SET whatsapp_status = 'subscribed', whatsapp_status_source = $2, whatsapp_status_at = now(), updated_at = now()
     WHERE normalized_email = lower(trim($1)) AND whatsapp_status <> 'unsubscribed'`,
    [email, source],
  );
}

/** Marketing needs an explicit yes. Utility messages (an order they just
 * placed, a call they just booked) are service messages and are not gated
 * here -- but an explicit opt-out still stops everything, which is why
 * `unsubscribed` is checked by callers of both kinds. */
export async function canSendWhatsAppMarketing(contactId: number): Promise<boolean> {
  const result = await pool.query<{ whatsapp_status: WhatsAppStatus }>(
    "SELECT whatsapp_status FROM contacts WHERE id = $1",
    [contactId],
  );
  return result.rows[0]?.whatsapp_status === "subscribed";
}

export async function hasOptedOut(phone: string): Promise<boolean> {
  const contactId = await findContactByPhone(phone);
  if (!contactId) return false;
  const result = await pool.query<{ whatsapp_status: WhatsAppStatus }>(
    "SELECT whatsapp_status FROM contacts WHERE id = $1",
    [contactId],
  );
  return result.rows[0]?.whatsapp_status === "unsubscribed";
}

/** A conversation is keyed by contact when we know who it is, and by bare
 * phone number when we don't -- someone can message the business number
 * without ever having been a contact, and that conversation still needs
 * somewhere to live. */
export type ConversationKey = { kind: "contact"; contactId: number } | { kind: "phone"; digits: string };

export function parseConversationKey(key: string): ConversationKey | null {
  if (/^c-\d+$/.test(key)) return { kind: "contact", contactId: Number(key.slice(2)) };
  if (/^p-\d{6,20}$/.test(key)) return { kind: "phone", digits: key.slice(2) };
  return null;
}

/** The 24-hour customer service window: Meta only allows a free-form reply
 * within 24 hours of the person's own last message. Outside it, only an
 * approved template can be sent. */
export async function replyWindow(key: ConversationKey): Promise<{ open: boolean; lastInboundAt: Date | null }> {
  const result =
    key.kind === "contact"
      ? await pool.query<{ created_at: Date }>(
          `SELECT created_at FROM whatsapp_messages
           WHERE contact_id = $1 AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1`,
          [key.contactId],
        )
      : await pool.query<{ created_at: Date }>(
          `SELECT created_at FROM whatsapp_messages
           WHERE contact_id IS NULL AND direction = 'inbound'
             AND regexp_replace(COALESCE(from_number, to_number), '\\D', '', 'g') = $1
           ORDER BY created_at DESC LIMIT 1`,
          [key.digits],
        );
  const lastInboundAt = result.rows[0]?.created_at ?? null;
  if (!lastInboundAt) return { open: false, lastInboundAt: null };
  return { open: Date.now() - new Date(lastInboundAt).getTime() < 24 * 60 * 60 * 1000, lastInboundAt };
}
