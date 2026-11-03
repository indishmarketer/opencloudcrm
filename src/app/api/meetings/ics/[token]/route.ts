import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { calVideoUrl } from "@/lib/calcom";
import { verifyMeetingManageToken } from "@/lib/meetingManageToken";
import { buildMeetingIcs } from "@/lib/ics";

/** The same manage token already emailed to attendees (reschedule/cancel
 * link) doubles as the capability to download this booking's .ics file --
 * no separate token type needed, and it stays valid for the same 90 days. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bookingId = await verifyMeetingManageToken(token);
  if (!bookingId) return NextResponse.json({ error: "Invalid or expired link." }, { status: 401 });

  const result = await pool.query(
    `SELECT mb.calcom_booking_uid, mb.scheduled_start, mb.scheduled_end, mb.status, mt.name AS meeting_name, mt.description
     FROM meeting_bookings mb JOIN meeting_types mt ON mt.id = mb.meeting_type_id WHERE mb.id = $1`,
    [bookingId]
  );
  const booking = result.rows[0];
  if (!booking || booking.status === "cancelled") return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const ics = buildMeetingIcs({
    uid: booking.calcom_booking_uid,
    title: booking.meeting_name,
    start: new Date(booking.scheduled_start),
    end: new Date(booking.scheduled_end),
    description: booking.description || undefined,
    url: calVideoUrl(booking.calcom_booking_uid),
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="meeting.ics"`,
    },
  });
}
