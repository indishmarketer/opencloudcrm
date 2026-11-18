import type { Pool, PoolClient } from "pg";
import { pool } from "@/lib/db";
import { hardcodedSourcePathForLabel, sourcePath } from "@/lib/pageSourcesShape";

type Queryable = Pick<Pool | PoolClient, "query">;
type ContactSourceEntry = string | { label: string; path?: string | null } | null | undefined;

export function normalizeContactEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Where a contact's country came from; see migration 105 for who may
 * overwrite whom. */
export type CountrySource = "ip" | "form" | "self" | "owner";

/** Where a contact's phone number came from. 'form' is the signup/checkout
 * form or the call-booking widget; 'self' is the person editing it directly
 * in account settings; 'razorpay'/'paypal' are numbers the respective
 * gateway handed back after a payment. See migration 115. */
export type PhoneSource = "form" | "self" | "owner" | "razorpay" | "paypal";

// True when an incoming country (EXCLUDED.*) should replace the stored one:
// deliberate edits ('self', 'owner') always do; a form answer only fills an
// empty or IP-guessed value; an IP guess only fills an empty one.
const COUNTRY_WINS = `EXCLUDED.country IS NOT NULL AND (
  EXCLUDED.country_source IN ('self', 'owner')
  OR (EXCLUDED.country_source = 'form' AND (contacts.country IS NULL OR contacts.country_source = 'ip'))
  OR (EXCLUDED.country_source = 'ip' AND contacts.country IS NULL))`;

// Same idea for phone: a deliberate edit always wins; a form answer or a
// gateway-returned number only fills an empty slot, so neither one silently
// overwrites a number the person entered themselves.
const PHONE_WINS = `EXCLUDED.phone IS NOT NULL AND (
  EXCLUDED.phone_source IN ('self', 'owner')
  OR contacts.phone IS NULL)`;

/** Every way a contact can first arrive, and how the console labels it. */
export const CONTACT_SOURCE_LABELS = {
  synced: "Unknown", email: "Sent an email", manual: "Added by you", import: "Imported", open_source: "Open-source waitlist",
  account: "Account signup", newsletter: "Newsletter", contact_form: "Contact form", form: "Form", guide: "Free guide",
  meeting: "Meeting booking", webinar: "Webinar", course: "Course", tool_submission: "Tool submission", author: "Author application",
  payment: "Payment", review: "Review", community: "Community", event: "Site event",
} as const;
export type ContactSource = keyof typeof CONTACT_SOURCE_LABELS;

export async function ensureContact(
  input: {
    email: string;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    address?: string | null;
    userId?: number | null;
    seenAt?: Date;
    country?: string | null;
    countrySource?: CountrySource;
    phone?: string | null;
    phoneSource?: PhoneSource;
    /** How this person first arrived (see CONTACT_SOURCE_LABELS). Kept
     * once set, except that the weak "synced"/"email" give way to the
     * first real one. */
    source?: ContactSource;
    /** The owner-written source label shown in Contacts: the page's source
     * (src/lib/pageSources.ts), else the form's own source. Never generated. */
    sourceDetail?: ContactSourceEntry;
    /** More source labels to record alongside, e.g. the page someone came
     * from before creating an account. */
    extraSources?: ContactSourceEntry[];
  },
  db: Queryable = pool,
): Promise<number> {
  const email = normalizeContactEmail(input.email);
  const country = input.country && input.countrySource ? input.country : null;
  const phone = input.phone && input.phoneSource ? input.phone : null;
  const result = await db.query<{ id: string }>(
    `INSERT INTO contacts (email, normalized_email, user_id, name, first_name, last_name, address, first_seen_at, last_seen_at, country, country_source, phone, phone_source, source, source_detail)
     VALUES ($1, $1, $2, $3, $9, $10, $11, COALESCE($4, now()), COALESCE($4, now()), $5, $6, $7, $8, COALESCE($12, 'synced'), $13)
     ON CONFLICT (normalized_email) DO UPDATE SET
       source = CASE WHEN contacts.source IN ('synced', 'email') AND EXCLUDED.source NOT IN ('synced', 'email') THEN EXCLUDED.source
         WHEN contacts.source = 'synced' THEN EXCLUDED.source ELSE contacts.source END,
       -- The owner-written source label: the first one a contact gets stays.
       source_detail = COALESCE(contacts.source_detail, EXCLUDED.source_detail),
       user_id = COALESCE(contacts.user_id, EXCLUDED.user_id),
       name = COALESCE(EXCLUDED.name, contacts.name),
       -- Name parts and address only ever fill an empty slot: a form answer
       -- must not overwrite something the owner or the person themselves
       -- already put on the record.
       first_name = COALESCE(contacts.first_name, EXCLUDED.first_name),
       last_name = COALESCE(contacts.last_name, EXCLUDED.last_name),
       address = COALESCE(contacts.address, EXCLUDED.address),
       last_seen_at = GREATEST(contacts.last_seen_at, EXCLUDED.last_seen_at),
       country = CASE WHEN ${COUNTRY_WINS} THEN EXCLUDED.country ELSE contacts.country END,
       country_source = CASE WHEN ${COUNTRY_WINS} THEN EXCLUDED.country_source ELSE contacts.country_source END,
       phone = CASE WHEN ${PHONE_WINS} THEN EXCLUDED.phone ELSE contacts.phone END,
       phone_source = CASE WHEN ${PHONE_WINS} THEN EXCLUDED.phone_source ELSE contacts.phone_source END,
       updated_at = now()
     RETURNING id`,
    [
      email, input.userId ?? null, input.name?.trim() || null, input.seenAt ?? null,
      country, country ? input.countrySource : null,
      phone, phone ? input.phoneSource : null,
      input.firstName?.trim() || null, input.lastName?.trim() || null, input.address?.trim() || null,
      input.source ?? null,
      (typeof input.sourceDetail === "string" ? input.sourceDetail : input.sourceDetail?.label)?.trim().slice(0, 200) || null,
    ],
  );
  const contactId = Number(result.rows[0].id);
  const sourceEntries: { label: string; path: string | null }[] = [];
  for (const value of [input.sourceDetail, ...(input.extraSources || [])]) {
    const rawLabel = typeof value === "string" ? value : value?.label;
    const label = rawLabel?.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!label || sourceEntries.some((entry) => entry.label.toLowerCase() === label.toLowerCase())) continue;
    const exactPath = typeof value === "object" && value ? sourcePath(value.path) : null;
    sourceEntries.push({ label, path: exactPath || hardcodedSourcePathForLabel(label) });
  }
  if (sourceEntries.length) {
    // One row per code-owned label, with the exact internal path when known.
    // This deliberately has no page_sources dependency: production sources
    // are hardcoded and cannot silently disappear when a console row is absent.
    await db.query(
      `INSERT INTO contact_sources (contact_id, label, path)
       SELECT $1, s.label, s.path
       FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS s(label, path, ord)
       ORDER BY s.ord
       ON CONFLICT DO NOTHING`,
      [contactId, sourceEntries.map((entry) => entry.label), sourceEntries.map((entry) => entry.path)],
    ).catch((error) => console.error("recording contact source failed (non-fatal):", error));
  }
  return contactId;
}

/** A new password signup has opted in but has not proved ownership of the
 * inbox yet. Represent that accurately instead of displaying "Never
 * subscribed". An earlier explicit unsubscribe is never overwritten. */
export async function markContactSubscriptionPending(email: string, db: Queryable = pool): Promise<void> {
  await db.query(
    `UPDATE contacts SET marketing_status = 'pending', updated_at = now()
     WHERE normalized_email = $1 AND marketing_status = 'unknown'`,
    [normalizeContactEmail(email)],
  );
}

export async function markContactSuppressed(
  email: string,
  status: "suppressed" | "bounced" | "complained" | "invalid",
  db: Queryable = pool,
): Promise<void> {
  const contactId = await ensureContact({ email }, db);
  await db.query(
    `UPDATE contacts
     SET deliverability_status = $2,
         marketing_status = CASE WHEN $2 = 'suppressed' THEN 'unsubscribed' ELSE marketing_status END,
         updated_at = now()
     WHERE id = $1`,
    [contactId, status],
  );
}

/** A hard bounce / invalid-email classification from the email provider can
 * be stale or simply wrong (a temporary mailbox-full state, a provider
 * misclassification). Fresh direct proof the inbox is real and receiving
 * mail -- a correctly-entered OTP code, a clicked account-verification link
 * -- overrides that. Deliberate unsubscribes and spam complaints are a
 * person's choice, not a mailbox-health signal, so those are left alone
 * here; only a fresh explicit opt-in (see confirmContactSubscribed) can
 * clear those. */
export async function confirmContactDeliverable(email: string, db: Queryable = pool): Promise<void> {
  const normalized = normalizeContactEmail(email);
  const result = await db.query(
    `UPDATE contacts SET deliverability_status = 'ok', updated_at = now()
     WHERE normalized_email = $1 AND deliverability_status IN ('bounced', 'invalid')
     RETURNING id`,
    [normalized],
  );
  if (result.rowCount) {
    await db.query("DELETE FROM email_suppressions WHERE email = $1", [normalized]);
  }
}

/** Call this only from an actual explicit-consent action (e.g. completing
 * newsletter double opt-in, or booking a meeting call), never from a bare
 * account signup or login -- this is the one place that is allowed to
 * promote a contact to 'subscribed'. An explicit unsubscribe or spam
 * complaint is left in place even here: someone who already opted out or
 * flagged prior mail as spam needs a fresh explicit opt-in or a human
 * review, not to be silently re-subscribed by an unrelated action. */
export async function confirmContactSubscribed(email: string, db: Queryable = pool): Promise<void> {
  const contactId = await ensureContact({ email }, db);
  const current = await db.query<{ deliverability_status: string; marketing_status: string }>(
    "SELECT deliverability_status, marketing_status FROM contacts WHERE id = $1", [contactId],
  );
  if (current.rows[0]?.marketing_status === "unsubscribed") return;
  const wasComplained = current.rows[0]?.deliverability_status === "complained";
  await db.query(
    `UPDATE contacts SET marketing_status = 'subscribed',
       deliverability_status = $2, updated_at = now() WHERE id = $1`,
    [contactId, wasComplained ? "complained" : "ok"],
  );
  if (!wasComplained) {
    await db.query("DELETE FROM email_suppressions WHERE email = $1", [normalizeContactEmail(email)]);
  }
}

/** Use this for new features that record an action outside one of the
 * database-triggered tables. The source record key makes retries idempotent. */
export async function recordContactActivity(
  input: {
    email: string;
    activityType: string;
    source: string;
    sourceRecordId: string | number;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
    name?: string | null;
    phone?: string | null;
    userId?: number | null;
  },
  db: Queryable = pool,
): Promise<void> {
  const contactId = await ensureContact({
    email: input.email,
    name: input.name,
    userId: input.userId,
    seenAt: input.occurredAt,
    phone: input.phone,
    phoneSource: input.phone ? "form" : undefined,
  }, db);
  await db.query(
    `INSERT INTO contact_activities
       (contact_id, activity_type, source, source_record_id, metadata, occurred_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))
     ON CONFLICT (source, source_record_id, activity_type) DO UPDATE SET
       contact_id = EXCLUDED.contact_id,
       metadata = EXCLUDED.metadata,
       occurred_at = EXCLUDED.occurred_at`,
    [contactId, input.activityType, input.source, String(input.sourceRecordId),
     JSON.stringify(input.metadata || {}), input.occurredAt ?? null],
  );
}
