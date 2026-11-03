import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession, getSession } from "@/lib/auth";
import { rescheduleBooking } from "@/lib/calcom";
import { withTransaction, pool } from "@/lib/db";
import { ensureContact } from "@/lib/contacts";
import { sendMeetingReschedule, sendMeetingOwnerRescheduledNotice } from "@/lib/meetingEmails";
import { verifyMeetingManageToken } from "@/lib/meetingManageToken";
import { bookingDataFromCalcom, isValidDateTime, isValidTimeZone } from "@/lib/meetingUtils";
import { consumeRateLimit } from "@/lib/rateLimit";

const bodySchema = z.object({ start: z.string().trim().min(10).max(64), timezone: z.string().trim().min(1).max(100).optional(), reason: z.string().trim().max(500).optional(), manageToken: z.string().trim().min(1).max(2000).optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const bookingId = Number((await params).id);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid rescheduling details." }, { status: 400 });
  if (!isValidDateTime(parsed.data.start) || (parsed.data.timezone && !isValidTimeZone(parsed.data.timezone))) return NextResponse.json({ error: "Invalid start time or timezone." }, { status: 400 });
  const newStart = new Date(parsed.data.start);
  if (newStart.getTime() <= Date.now() || newStart.getTime() > Date.now() + 366 * 86400000) return NextResponse.json({ error: "Choose a future time within the next year." }, { status: 400 });

  const session = await getSession(); const admin = await getAdminSession();
  // Self-service via the emailed manage link, for guests with no account.
  const tokenBookingId = parsed.data.manageToken ? await verifyMeetingManageToken(parsed.data.manageToken) : null;
  const viaManageToken = tokenBookingId !== null && tokenBookingId === bookingId;
  if (!session && !admin && !viaManageToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rateKey = admin ? "admin" : String(session?.userId || req.headers.get("cf-connecting-ip") || "unknown");
  if (!(await consumeRateLimit(`meeting-reschedule:${rateKey}`, 10, 60 * 60 * 1000))) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const result = await pool.query(`SELECT mb.*, mt.name AS meeting_name, mt.duration_minutes, c.user_id AS contact_user_id FROM meeting_bookings mb JOIN meeting_types mt ON mt.id = mb.meeting_type_id LEFT JOIN contacts c ON c.id = mb.contact_id WHERE mb.id = $1`, [bookingId]);
  const booking = result.rows[0];
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!admin && !viaManageToken && !(booking.user_id === session?.userId || booking.contact_user_id === session?.userId || String(booking.attendee_email).toLowerCase() === session?.email.toLowerCase())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (booking.status !== "confirmed") return NextResponse.json({ error: "Only confirmed meetings can be rescheduled." }, { status: 400 });
  let calResult;
  try { calResult = await rescheduleBooking({ bookingUid: booking.calcom_booking_uid, start: newStart.toISOString(), rescheduledBy: session?.email || process.env.ADMIN_EMAIL || "admin", reschedulingReason: parsed.data.reason }); }
  catch (error) {
    console.error("Cal.com rescheduling failed:", error);
    // Shown straight to the admin (this route has no other guest-facing
    // caller besides the manage-token flow) -- Cal.com's own message is more
    // useful than a generic failure, e.g. "Rescheduling past bookings is not
    // allowed for this event type."
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reschedule the booking." }, { status: 500 });
  }
  const next = bookingDataFromCalcom(calResult.data, newStart, Number(booking.duration_minutes));
  const saved = await withTransaction(async (client) => {
    await client.query("UPDATE meeting_bookings SET status = 'rescheduled', updated_at = now() WHERE id = $1", [bookingId]);
    if (!next.uid || next.uid === booking.calcom_booking_uid) return null;
    const contactId = booking.contact_id || await ensureContact({ email: booking.attendee_email, name: booking.attendee_name, userId: booking.user_id }, client);
    await client.query(`INSERT INTO meeting_bookings (meeting_type_id, calcom_booking_uid, user_id, contact_id, attendee_name, attendee_email, attendee_timezone, scheduled_start, scheduled_end, status, rescheduled_from_booking_id, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed', $10, $11) ON CONFLICT (calcom_booking_uid) DO NOTHING`, [booking.meeting_type_id, next.uid, booking.user_id, contactId, booking.attendee_name, booking.attendee_email, parsed.data.timezone || booking.attendee_timezone, next.start, next.end, bookingId, booking.notes]);
    const row = await client.query("SELECT id, calcom_booking_uid, attendee_email, attendee_name, attendee_timezone, scheduled_start, scheduled_end, status, notes FROM meeting_bookings WHERE calcom_booking_uid = $1", [next.uid]);
    return row.rows[0] || null;
  });
  const row = saved || { id: bookingId, calcom_booking_uid: booking.calcom_booking_uid, attendee_email: booking.attendee_email, attendee_name: booking.attendee_name, attendee_timezone: parsed.data.timezone || booking.attendee_timezone, scheduled_start: next.start, scheduled_end: next.end, status: "confirmed", notes: booking.notes };
  const emailSent = await sendMeetingReschedule({ attendeeEmail: row.attendee_email, attendeeName: row.attendee_name, attendeeTimeZone: row.attendee_timezone, meetingName: booking.meeting_name, scheduledStart: row.scheduled_start, scheduledEnd: row.scheduled_end, bookingId: Number(row.id), calcomBookingUid: row.calcom_booking_uid });
  if (!admin) {
    sendMeetingOwnerRescheduledNotice({ attendeeEmail: row.attendee_email, attendeeName: row.attendee_name, meetingName: booking.meeting_name, scheduledStart: row.scheduled_start }).catch((error) => console.error("Owner reschedule notice failed:", error));
  }
  return NextResponse.json({ ok: true, booking: { ...row, id: Number(row.id) }, emailSent });
}
