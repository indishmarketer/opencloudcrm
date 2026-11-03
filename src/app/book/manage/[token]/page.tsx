import type { Metadata } from "next";
import { pool } from "@/lib/db";
import { verifyMeetingManageToken } from "@/lib/meetingManageToken";
import { calVideoUrl } from "@/lib/calcom";
import ManageBookingWidget from "@/components/ManageBookingWidget";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }> };

export default async function ManageBookingPage({ params }: Props) {
  const { token } = await params;
  const bookingId = await verifyMeetingManageToken(token);

  if (!bookingId) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">This link has expired</h1>
        <p className="mt-3 text-sm text-ink-soft">Manage links are valid for 90 days. Check your confirmation email for a more recent one, or contact us directly.</p>
      </main>
    );
  }

  const result = await pool.query(
    `SELECT mb.id, mb.calcom_booking_uid, mb.attendee_name, mb.attendee_email, mb.attendee_timezone, mb.scheduled_start, mb.scheduled_end, mb.status,
            mt.slug AS meeting_type_slug, mt.name AS meeting_type_name, mt.duration_minutes
     FROM meeting_bookings mb JOIN meeting_types mt ON mt.id = mb.meeting_type_id WHERE mb.id = $1`,
    [bookingId]
  );
  const booking = result.rows[0];

  if (!booking) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Booking not found</h1>
        <p className="mt-3 text-sm text-ink-soft">This booking may have been removed. Contact us if you think this is a mistake.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-2xl border border-line bg-paper p-6 shadow-sm">
        <h1 className="mb-2 font-display text-3xl font-semibold">{booking.meeting_type_name}</h1>
        <p className="mb-6 text-sm font-medium text-ink-soft">{booking.duration_minutes} minutes</p>
        <ManageBookingWidget
          bookingId={Number(booking.id)}
          token={token}
          meetingTypeSlug={booking.meeting_type_slug}
          status={booking.status}
          scheduledStart={booking.scheduled_start}
          attendeeTimezone={booking.attendee_timezone}
          joinUrl={calVideoUrl(booking.calcom_booking_uid)}
        />
      </div>
    </main>
  );
}
