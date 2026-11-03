import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { cancelBooking } from "@/lib/calcom";
import { pool } from "@/lib/db";

const patchSchema = z.object({ host_no_show: z.boolean().optional(), guest_no_show: z.boolean().optional(), admin_notes: z.string().trim().max(2000).optional() });

/** Admin-only booking edits: manual correction for the two no-show flags
 * (normally set only by the AFTER_*_CAL_VIDEO_NO_SHOW webhooks, which
 * depend on Cal Video actually detecting the no-show and the webhook
 * arriving -- lets the admin fix it by hand when either of those didn't
 * happen), and the private admin_notes field (host-only, never shown to
 * the attendee, distinct from their own "notes" message). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bookingId = Number((await params).id);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || (parsed.data.host_no_show === undefined && parsed.data.guest_no_show === undefined && parsed.data.admin_notes === undefined)) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const result = await pool.query(
    `UPDATE meeting_bookings SET host_no_show = COALESCE($2, host_no_show), guest_no_show = COALESCE($3, guest_no_show), admin_notes = COALESCE($4, admin_notes), updated_at = now() WHERE id = $1 RETURNING host_no_show, guest_no_show, admin_notes`,
    [bookingId, parsed.data.host_no_show ?? null, parsed.data.guest_no_show ?? null, parsed.data.admin_notes ?? null]
  );
  if (!result.rows[0]) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  return NextResponse.json({ ok: true, ...result.rows[0] });
}

/** Permanently removes a booking record -- for cleanup once a meeting is
 * done, distinct from Cancel (which is for upcoming meetings and calls
 * Cal.com's own cancel API, which rejects bookings whose time has already
 * passed: "Cannot cancel a booking that has already ended"). Admin-only,
 * console-triggered. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bookingId = Number((await params).id);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });

  const result = await pool.query("SELECT calcom_booking_uid, status, scheduled_end FROM meeting_bookings WHERE id = $1", [bookingId]);
  const booking = result.rows[0];
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  // Best-effort: if it's somehow still cancellable on Cal.com's side (e.g.
  // status drifted out of sync), try to tidy that up too, but never let a
  // Cal.com failure block deleting our own record -- that's the whole
  // point of this endpoint (cleanup once Cal.com itself refuses further
  // action on an already-elapsed booking).
  if (booking.status === "confirmed") {
    try { await cancelBooking(booking.calcom_booking_uid, "Removed by console administrator"); }
    catch (error) { console.error("Best-effort Cal.com cancel before delete failed (continuing):", error); }
  }

  await pool.query("DELETE FROM meeting_bookings WHERE id = $1", [bookingId]);
  return NextResponse.json({ ok: true });
}
