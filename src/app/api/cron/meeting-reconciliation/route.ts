import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { listBookings } from "@/lib/calcom";
import { sendMeetingReconciliationOrphanAlert } from "@/lib/meetingEmails";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET; const auth = req.headers.get("authorization"); const expected = secret ? `Bearer ${secret}` : null;
  return !!expected && !!auth && expected.length === auth.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(auth));
}

const MAX_PAGES = 5; // 5 * 100 = 500 bookings per run, comfortably above real volume.

/** Defense-in-depth safety net, not the primary sync path (the Cal.com
 * webhook is): once a day, cross-checks a bounded window of Cal.com
 * bookings against our own records and self-heals the one risky drift
 * direction -- a booking we still show as "confirmed" that Cal.com has
 * actually cancelled (e.g. the owner cancelled it directly in Cal.com's own
 * dashboard, or a cancellation webhook was never delivered). Deliberately
 * does NOT try to resurrect bookings or auto-insert ones missing entirely
 * from our DB -- those get reported, not auto-corrected, since guessing
 * wrong there is worse than a missed webhook alone. */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const afterStart = new Date(Date.now() - 3 * 86400000).toISOString();
  const beforeEnd = new Date(Date.now() + 45 * 86400000).toISOString();

  let cursor: string | undefined;
  let pages = 0;
  const calcomBookings: { uid: string; status: string }[] = [];
  try {
    do {
      const page = await listBookings({ afterStart, beforeEnd, cursor, limit: 100 });
      calcomBookings.push(...page.bookings.map((b) => ({ uid: b.uid, status: b.status })));
      cursor = page.nextCursor || undefined;
      pages++;
    } while (cursor && pages < MAX_PAGES);
  } catch (error) {
    console.error("Meeting reconciliation: could not list Cal.com bookings:", error);
    return NextResponse.json({ error: "Could not fetch Cal.com bookings." }, { status: 502 });
  }

  const uids = calcomBookings.map((b) => b.uid).filter(Boolean);
  if (!uids.length) return NextResponse.json({ ok: true, checked: 0, corrected: 0, orphaned: 0 });

  const localRows = await pool.query(
    `SELECT calcom_booking_uid, status FROM meeting_bookings WHERE calcom_booking_uid = ANY($1::text[])`,
    [uids]
  );
  const localStatusByUid = new Map(localRows.rows.map((r) => [r.calcom_booking_uid, r.status]));

  let corrected = 0;
  for (const b of calcomBookings) {
    const localStatus = localStatusByUid.get(b.uid);
    if (localStatus === "confirmed" && b.status === "cancelled") {
      await pool.query(
        `UPDATE meeting_bookings SET status = 'cancelled', cancellation_reason = COALESCE(cancellation_reason, 'Cancelled on Cal.com directly; caught by reconciliation'), updated_at = now() WHERE calcom_booking_uid = $1 AND status = 'confirmed'`,
        [b.uid]
      );
      corrected++;
    }
  }

  // Cal.com bookings in this window with no local row at all -- reported,
  // not auto-inserted (see function comment for why).
  const knownUids = new Set(localStatusByUid.keys());
  const orphanedUids = uids.filter((uid) => !knownUids.has(uid));
  if (orphanedUids.length) {
    sendMeetingReconciliationOrphanAlert({ count: orphanedUids.length, exampleUid: orphanedUids[0] }).catch((err) => console.error("Reconciliation orphan alert failed:", err));
  }

  return NextResponse.json({ ok: true, checked: calcomBookings.length, corrected, orphaned: orphanedUids.length });
}
