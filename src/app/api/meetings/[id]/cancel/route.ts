import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession, getSession } from "@/lib/auth";
import { cancelBooking } from "@/lib/calcom";
import { pool } from "@/lib/db";
import { sendMeetingCancellation, sendMeetingOwnerCancelledNotice } from "@/lib/meetingEmails";
import { verifyMeetingManageToken } from "@/lib/meetingManageToken";
import { consumeRateLimit } from "@/lib/rateLimit";

const bodySchema = z.object({ reason: z.string().trim().max(500).optional(), manageToken: z.string().trim().min(1).max(2000).optional() }).default({});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const bookingId = Number((await params).id);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cancellation reason." }, { status: 400 });

  const session = await getSession(); const admin = await getAdminSession();
  // Self-service via the emailed manage link, for guests with no account.
  const tokenBookingId = parsed.data.manageToken ? await verifyMeetingManageToken(parsed.data.manageToken) : null;
  const viaManageToken = tokenBookingId !== null && tokenBookingId === bookingId;
  if (!session && !admin && !viaManageToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rateKey = admin ? "admin" : String(session?.userId || req.headers.get("cf-connecting-ip") || "unknown");
  if (!(await consumeRateLimit(`meeting-cancel:${rateKey}`, 10, 60 * 60 * 1000))) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const result = await pool.query(`SELECT mb.id, mb.calcom_booking_uid, mb.user_id, mb.attendee_email, mb.attendee_name, mb.scheduled_start, mb.scheduled_end, mb.status, mb.cancellation_reason, mt.name AS meeting_name, c.user_id AS contact_user_id FROM meeting_bookings mb JOIN meeting_types mt ON mt.id = mb.meeting_type_id LEFT JOIN contacts c ON c.id = mb.contact_id WHERE mb.id = $1`, [bookingId]);
  const booking = result.rows[0];
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!admin && !viaManageToken && !(booking.user_id === session?.userId || booking.contact_user_id === session?.userId || String(booking.attendee_email).toLowerCase() === session?.email.toLowerCase())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const reason = parsed.data.reason || "User requested cancellation";
  if (booking.status === "cancelled") return NextResponse.json({ ok: true, alreadyCancelled: true });
  try { await cancelBooking(booking.calcom_booking_uid, reason); }
  catch (error) {
    console.error("Cal.com cancellation failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not cancel the booking." }, { status: 500 });
  }
  await pool.query(`UPDATE meeting_bookings SET status = 'cancelled', cancellation_reason = $2, updated_at = now() WHERE id = $1`, [bookingId, reason]);
  const emailSent = await sendMeetingCancellation({ attendeeEmail: booking.attendee_email, attendeeName: booking.attendee_name, meetingName: booking.meeting_name, cancellationReason: reason, calcomBookingUid: booking.calcom_booking_uid, scheduledStart: booking.scheduled_start, scheduledEnd: booking.scheduled_end });
  if (!admin) {
    sendMeetingOwnerCancelledNotice({ attendeeEmail: booking.attendee_email, attendeeName: booking.attendee_name, meetingName: booking.meeting_name, scheduledStart: booking.scheduled_start, cancellationReason: reason }).catch((error) => console.error("Owner cancellation notice failed:", error));
  }
  return NextResponse.json({ ok: true, emailSent });
}
