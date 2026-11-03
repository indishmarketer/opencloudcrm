import { pool } from "@/lib/db";
import ConsoleMeetings from "@/components/ConsoleMeetings";

const PAGE_SIZE = 50;

function first(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] || "" : value || ""; }

export default async function ConsoleMeetingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requestedStatus = first(params.status);
  const status = ["confirmed", "cancelled", "rescheduled", "completed"].includes(requestedStatus) ? requestedStatus : "";
  const typeSlug = first(params.type).trim().slice(0, 120);
  const fromValue = first(params.from); const toValue = first(params.to);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromValue) ? fromValue : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toValue) ? toValue : "";
  const search = first(params.q).trim().slice(0, 200);
  const page = Math.max(1, parseInt(first(params.page), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const whereClause = `WHERE ($1 = '' OR mb.status = $1) AND ($2 = '' OR mt.slug = $2) AND ($3 = '' OR mb.scheduled_start >= $3::date) AND ($4 = '' OR mb.scheduled_start < ($4::date + interval '1 day')) AND ($5 = '' OR mb.attendee_name ILIKE '%' || $5 || '%' OR mb.attendee_email ILIKE '%' || $5 || '%')`;
  const whereParams = [status, typeSlug, from, to, search];

  const [bookings, types, countResult] = await Promise.all([
    pool.query(
      `SELECT mb.id, mb.attendee_name, mb.attendee_email, mb.attendee_timezone, mb.scheduled_start, mb.scheduled_end, mb.status, mb.actual_start_at, mb.actual_end_at, mb.host_no_show, mb.guest_no_show, mb.cancellation_reason, mb.notes, mb.admin_notes, mb.calcom_booking_uid, mb.contact_id, mb.created_at, mb.rescheduled_from_booking_id, mt.slug AS meeting_type_slug, mt.name AS meeting_type_name, mt.duration_minutes
       FROM meeting_bookings mb JOIN meeting_types mt ON mt.id = mb.meeting_type_id
       ${whereClause}
       ORDER BY mb.scheduled_start DESC, mb.id DESC LIMIT $6 OFFSET $7`,
      [...whereParams, PAGE_SIZE, offset]
    ),
    pool.query("SELECT slug, name FROM meeting_types WHERE active = true ORDER BY name ASC"),
    pool.query(`SELECT count(*) FROM meeting_bookings mb JOIN meeting_types mt ON mt.id = mb.meeting_type_id ${whereClause}`, whereParams),
  ]);
  const totalCount = Number(countResult.rows[0]?.count || 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  return (
    <ConsoleMeetings
      key={`${status}|${typeSlug}|${from}|${to}|${search}|${currentPage}`}
      bookings={bookings.rows}
      types={types.rows}
      filters={{ status, type: typeSlug, from, to, q: search }}
      pagination={{ page: currentPage, pageSize: PAGE_SIZE, totalCount, totalPages }}
    />
  );
}
