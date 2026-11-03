import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { ensureContact } from "@/lib/contacts";
import { verifyCalcomWebhookSignature } from "@/lib/calcom";
import { sendMeetingOwnerNotification, sendMeetingNoShowRecovery, sendMeetingFollowUp, sendMeetingUnrecognizedTypeAlert } from "@/lib/meetingEmails";
import { pool, withTransaction } from "@/lib/db";

type NewBookingNotice = { id: number; meetingName: string; attendeeName: string; attendeeEmail: string; scheduledStart: Date };

const RELEVANT_TRIGGERS = [
  "BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED",
  "MEETING_STARTED", "MEETING_ENDED",
  "AFTER_HOSTS_CAL_VIDEO_NO_SHOW", "AFTER_GUESTS_CAL_VIDEO_NO_SHOW",
];

type JsonRecord = Record<string, unknown>;
function asRecord(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function stringValue(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function responseValue(value: unknown): string | null { return typeof value === "string" ? value.trim() || null : value && typeof value === "object" ? stringValue((value as JsonRecord).value) : null; }

function attendeeFromPayload(data: JsonRecord) {
  const attendee = Array.isArray(data.attendees) ? asRecord(data.attendees[0]) : {};
  const responses = asRecord(data.responses);
  return {
    name: stringValue(attendee.name) || responseValue(responses.name),
    email: (stringValue(attendee.email) || responseValue(responses.email))?.toLowerCase() || null,
    timeZone: stringValue(attendee.timeZone) || "UTC",
  };
}

async function meetingTypeForPayload(client: PoolClient, data: JsonRecord) {
  const eventTypeId = data.eventTypeId == null ? null : String(data.eventTypeId);
  const eventSlug = stringValue(data.type);
  const result = await client.query(`SELECT id, slug, name, duration_minutes, calcom_event_type_id, calcom_username, calcom_event_slug FROM meeting_types WHERE ($1::text IS NOT NULL AND calcom_event_type_id = $1) OR ($2::text IS NOT NULL AND calcom_event_slug = $2) ORDER BY active DESC, id ASC LIMIT 1`, [eventTypeId, eventSlug]);
  return result.rows[0] || null;
}

async function upsertBooking(client: PoolClient, data: JsonRecord, oldBookingId: number | null): Promise<NewBookingNotice | null> {
  const uid = stringValue(data.uid) || stringValue(data.bookingUid);
  if (!uid) return null;
  const startValue = stringValue(data.startTime) || stringValue(data.start);
  const endValue = stringValue(data.endTime) || stringValue(data.end);
  const start = startValue && !Number.isNaN(Date.parse(startValue)) ? new Date(startValue) : null;
  const end = endValue && !Number.isNaN(Date.parse(endValue)) ? new Date(endValue) : null;
  const attendee = attendeeFromPayload(data);
  const existing = await client.query("SELECT id, user_id, contact_id FROM meeting_bookings WHERE calcom_booking_uid = $1", [uid]);
  const meetingType = await meetingTypeForPayload(client, data);
  let contactId = existing.rows[0]?.contact_id || null;
  let userId = existing.rows[0]?.user_id || null;
  if (attendee.email) {
    contactId = await ensureContact({ email: attendee.email, name: attendee.name, userId }, client);
    if (!userId) {
      const user = await client.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [attendee.email]);
      userId = user.rows[0]?.id || null;
    }
  }
  if (existing.rows[0]) {
    await client.query(`UPDATE meeting_bookings SET attendee_name = COALESCE($2, attendee_name), attendee_email = COALESCE($3, attendee_email), attendee_timezone = COALESCE($4, attendee_timezone), scheduled_start = COALESCE($5, scheduled_start), scheduled_end = COALESCE($6, scheduled_end), user_id = COALESCE(user_id, $7), contact_id = COALESCE(contact_id, $8), status = CASE WHEN $9 = 'BOOKING_CANCELLED' THEN 'cancelled' ELSE status END, cancellation_reason = CASE WHEN $9 = 'BOOKING_CANCELLED' THEN $10 ELSE cancellation_reason END, updated_at = now() WHERE id = $1`, [existing.rows[0].id, attendee.name, attendee.email, attendee.timeZone, start, end, userId, contactId, data.triggerEvent || "", stringValue(data.cancellationReason)]);
    return null;
  }
  if (!meetingType) {
    const eventTypeId = data.eventTypeId == null ? null : String(data.eventTypeId);
    sendMeetingUnrecognizedTypeAlert({ calcomEventTypeId: eventTypeId, calcomEventSlug: stringValue(data.type), attendeeEmail: attendee.email, attendeeName: attendee.name }).catch((err) => console.error("Unrecognized meeting type alert failed:", err));
    return null;
  }
  if (!attendee.email || !attendee.name || !start || !end) return null;
  const status = data.triggerEvent === "BOOKING_CANCELLED" ? "cancelled" : "confirmed";
  const inserted = await client.query(`INSERT INTO meeting_bookings (meeting_type_id, calcom_booking_uid, user_id, contact_id, attendee_name, attendee_email, attendee_timezone, scheduled_start, scheduled_end, status, rescheduled_from_booking_id, cancellation_reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (calcom_booking_uid) DO NOTHING RETURNING id`, [meetingType.id, uid, userId, contactId, attendee.name, attendee.email, attendee.timeZone, start, end, status, oldBookingId, stringValue(data.cancellationReason)]);
  if (!inserted.rows[0] || status !== "confirmed") return null;
  return { id: inserted.rows[0].id, meetingName: meetingType.name, attendeeName: attendee.name, attendeeEmail: attendee.email, scheduledStart: start };
}

export async function POST(req: NextRequest) {
  const secret = process.env.CALCOM_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody) > 256 * 1024) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  if (!verifyCalcomWebhookSignature(secret, rawBody, req.headers.get("x-cal-signature-256"))) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  let body: JsonRecord;
  try { body = JSON.parse(rawBody) as JsonRecord; } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const trigger = stringValue(body.triggerEvent)?.toUpperCase();
  if (!trigger || !RELEVANT_TRIGGERS.includes(trigger)) return NextResponse.json({ ok: true, skipped: "irrelevant event" });
  const data = asRecord(body.payload); data.triggerEvent = trigger;
  const uid = stringValue(data.uid) || stringValue(data.bookingUid);
  if (!uid) return NextResponse.json({ ok: true, skipped: "missing booking uid" });

  if (trigger === "BOOKING_CANCELLED") {
    await pool.query("UPDATE meeting_bookings SET status = 'cancelled', cancellation_reason = COALESCE($2, cancellation_reason), updated_at = now() WHERE calcom_booking_uid = $1", [uid, stringValue(data.cancellationReason)]);
    return NextResponse.json({ ok: true });
  }

  // Real post-meeting analytics -- Cal.com's exact payload field names for
  // these newer event types aren't documented, so `now()` (when we receive
  // the webhook, which fires in near-real-time as the meeting actually
  // starts/ends) is used as the timestamp rather than guessing at a
  // specific payload field that may not exist.
  if (trigger === "MEETING_STARTED") {
    await pool.query("UPDATE meeting_bookings SET actual_start_at = COALESCE(actual_start_at, now()) WHERE calcom_booking_uid = $1", [uid]);
    return NextResponse.json({ ok: true });
  }
  if (trigger === "MEETING_ENDED") {
    await pool.query("UPDATE meeting_bookings SET actual_end_at = now() WHERE calcom_booking_uid = $1", [uid]);
    // Guarded by "WHERE status = 'confirmed'" so a redelivered webhook can
    // never re-trigger the one-time follow-up email below.
    const completed = await pool.query(
      `UPDATE meeting_bookings mb SET status = 'completed', updated_at = now()
       FROM meeting_types mt
       WHERE mb.calcom_booking_uid = $1 AND mb.status = 'confirmed' AND mt.id = mb.meeting_type_id
       RETURNING mb.attendee_email, mb.attendee_name, mt.name AS meeting_name`,
      [uid]
    );
    const row = completed.rows[0];
    if (row) {
      sendMeetingFollowUp({ attendeeEmail: row.attendee_email, attendeeName: row.attendee_name, meetingName: row.meeting_name }).catch((err) => console.error("Meeting follow-up email failed:", err));
    }
    return NextResponse.json({ ok: true });
  }
  if (trigger === "AFTER_HOSTS_CAL_VIDEO_NO_SHOW") {
    await pool.query("UPDATE meeting_bookings SET host_no_show = true WHERE calcom_booking_uid = $1", [uid]);
    return NextResponse.json({ ok: true });
  }
  if (trigger === "AFTER_GUESTS_CAL_VIDEO_NO_SHOW") {
    // Guarded by "WHERE guest_no_show = false" so a redelivered webhook can
    // never send the recovery email twice for the same no-show.
    const noShow = await pool.query(
      `UPDATE meeting_bookings mb SET guest_no_show = true
       FROM meeting_types mt
       WHERE mb.calcom_booking_uid = $1 AND mb.guest_no_show = false AND mt.id = mb.meeting_type_id
       RETURNING mb.attendee_email, mb.attendee_name, mt.name AS meeting_name, mt.slug AS meeting_slug`,
      [uid]
    );
    const row = noShow.rows[0];
    if (row) {
      sendMeetingNoShowRecovery({ attendeeEmail: row.attendee_email, attendeeName: row.attendee_name, meetingName: row.meeting_name, meetingSlug: row.meeting_slug }).catch((err) => console.error("No-show recovery email failed:", err));
    }
    return NextResponse.json({ ok: true });
  }

  let newBooking: NewBookingNotice | null = null;
  try {
    newBooking = await withTransaction(async (client) => {
      if (trigger === "BOOKING_RESCHEDULED") {
        const previousUid = stringValue(data.rescheduleUid);
        let previousId: number | null = null;
        if (previousUid) {
          const previous = await client.query("UPDATE meeting_bookings SET status = 'rescheduled', updated_at = now() WHERE calcom_booking_uid = $1 RETURNING id", [previousUid]);
          previousId = previous.rows[0]?.id || null;
        }
        return upsertBooking(client, data, previousId);
      }
      return upsertBooking(client, data, null);
    });
  } catch (error) {
    console.error("Cal.com webhook processing failed:", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
  // Sent after the transaction commits, never inside it -- this is the
  // single place (webhook fires for every booking regardless of whether it
  // originated from our own widget or elsewhere) a new-booking owner
  // notification goes out, so the owner is never double-notified.
  if (newBooking) {
    sendMeetingOwnerNotification({
      attendeeName: newBooking.attendeeName,
      attendeeEmail: newBooking.attendeeEmail,
      meetingName: newBooking.meetingName,
      scheduledStart: newBooking.scheduledStart,
      bookingId: newBooking.id,
    }).catch((err) => console.error("Owner meeting notification failed:", err));
  }
  return NextResponse.json({ ok: true });
}
