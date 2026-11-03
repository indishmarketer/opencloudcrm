import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import ConsoleWebinarRegistrations from "@/components/ConsoleWebinarRegistrations";
import { isOfferedWebinarSession, type WebinarScheduleRule } from "@/lib/webinarSchedule";

const PAGE_SIZE = 50;

export default async function WebinarRegistrationsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; page?: string; session?: string }> }) {
  const webinarId = Number((await params).id);
  if (!Number.isInteger(webinarId)) notFound();
  const query = await searchParams;
  const q = (query.q || "").trim();
  const page = Math.max(1, Number(query.page) || 1);
  const sessionFilter = query.session && !Number.isNaN(new Date(query.session).getTime()) ? new Date(query.session).toISOString() : "";

  const webinarResult = await pool.query("SELECT id, title, duration_seconds FROM webinars WHERE id = $1 LIMIT 1", [webinarId]);
  const webinar = webinarResult.rows[0];
  if (!webinar) notFound();

  const whereParams: (string | number)[] = [webinarId];
  let whereClause = "wa.webinar_id = $1";
  if (q) {
    whereParams.push(`%${q}%`);
    whereClause += ` AND (COALESCE(c.name, u.name) ILIKE $${whereParams.length} OR COALESCE(c.email, u.email) ILIKE $${whereParams.length})`;
  }
  if (sessionFilter) {
    whereParams.push(sessionFilter);
    whereClause += ` AND wa.session_start_at = $${whereParams.length}`;
  }

  const [countResult, registrationsResult, summaryResult, broadcastsResult, schedulesResult] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS total FROM webinar_access wa
       LEFT JOIN contacts c ON c.id = wa.contact_id
       LEFT JOIN users u ON u.id = wa.user_id
       WHERE ${whereClause}`,
      whereParams,
    ),
    pool.query(
      `SELECT wa.id, wa.session_start_at, wa.attendee_timezone, wa.registered_at, wa.completed_at,
              wa.watch_seconds, wa.last_viewed_at, wa.left_at,
              COALESCE(c.name,u.name) AS name, COALESCE(c.email,u.email) AS email,
              w.duration_seconds, (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS server_now
       FROM webinar_access wa
       JOIN webinars w ON w.id = wa.webinar_id
       LEFT JOIN contacts c ON c.id = wa.contact_id
       LEFT JOIN users u ON u.id = wa.user_id
       WHERE ${whereClause}
       ORDER BY wa.registered_at DESC
       LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      whereParams,
    ),
    pool.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE watch_seconds > 0)::int AS attended, count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed
       FROM webinar_access WHERE webinar_id = $1`,
      [webinarId],
    ),
    // Every registration ever assigned to each broadcast time, live or since
    // moved on -- this is the "who signed up for which time" view the
    // per-page, registered-at-sorted table above can't answer on its own,
    // especially once a schedule edit orphans a prior broadcast's rows.
    pool.query(
      `WITH combined AS (
         SELECT session_start_at, watch_seconds, completed_at FROM webinar_access WHERE webinar_id = $1 AND session_start_at IS NOT NULL
         UNION ALL
         SELECT session_start_at, watch_seconds, completed_at FROM webinar_attendance_archive WHERE webinar_id = $1
       )
       SELECT session_start_at, count(*)::int AS total,
              count(*) FILTER (WHERE watch_seconds > 0)::int AS attended,
              count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed
       FROM combined
       GROUP BY session_start_at
       ORDER BY session_start_at DESC`,
      [webinarId],
    ),
    pool.query<WebinarScheduleRule>("SELECT * FROM webinar_schedules WHERE webinar_id = $1 AND active = true", [webinarId]),
  ]);

  const totalCount = countResult.rows[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const now = new Date();
  const broadcasts = broadcastsResult.rows.map((row) => {
    const sessionIso = new Date(row.session_start_at).toISOString();
    const isFuture = new Date(sessionIso).getTime() > now.getTime();
    const offered = isFuture && isOfferedWebinarSession(sessionIso, schedulesResult.rows, now, Number(webinar.duration_seconds || 0));
    return { ...row, session_start_at: sessionIso, isFuture, offered };
  });

  return <ConsoleWebinarRegistrations
    webinar={webinar}
    rows={registrationsResult.rows}
    summary={summaryResult.rows[0] || { total: 0, attended: 0, completed: 0 }}
    broadcasts={broadcasts}
    filters={{ q, session: sessionFilter }}
    pagination={{ page, pageSize: PAGE_SIZE, totalCount, totalPages }}
  />;
}
