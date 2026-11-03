import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import ConsoleWebinarTabs from "@/components/ConsoleWebinarTabs";
import { formatWebinarSessionWindow } from "@/lib/webinarReminders";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{label}</p>
    </div>
  );
}

/** Per-broadcast comparison -- attendance/completion data was already
 * tracked (watch_seconds, completed_at, left_at) but never aggregated
 * anywhere in console, so there was no way to see which time slot
 * actually performs better than another. */
export default async function WebinarAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const webinarId = Number((await params).id);
  if (!Number.isInteger(webinarId)) notFound();

  const [webinarResult, summaryResult, byBroadcastResult] = await Promise.all([
    pool.query("SELECT id, title, duration_seconds FROM webinars WHERE id = $1 LIMIT 1", [webinarId]),
    // "total" (live registrant count) intentionally comes from webinar_access
    // alone -- attended/completed/avg_watch_seconds fold in
    // webinar_attendance_archive too, so a person's earlier attendance isn't
    // lost from the aggregate just because they later re-registered for a
    // future broadcast (see migration 060).
    pool.query(
      `WITH combined AS (
         SELECT watch_seconds, completed_at FROM webinar_access WHERE webinar_id = $1
         UNION ALL
         SELECT watch_seconds, completed_at FROM webinar_attendance_archive WHERE webinar_id = $1
       )
       SELECT
         (SELECT count(*)::int FROM webinar_access WHERE webinar_id = $1) AS total,
         count(*) FILTER (WHERE watch_seconds > 0)::int AS attended,
         count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed,
         avg(watch_seconds) FILTER (WHERE watch_seconds > 0) AS avg_watch_seconds
       FROM combined`,
      [webinarId],
    ),
    pool.query(
      `WITH combined AS (
         SELECT session_start_at, watch_seconds, completed_at FROM webinar_access WHERE webinar_id = $1 AND session_start_at IS NOT NULL
         UNION ALL
         SELECT session_start_at, watch_seconds, completed_at FROM webinar_attendance_archive WHERE webinar_id = $1
       )
       SELECT session_start_at,
              count(*)::int AS registrations,
              count(*) FILTER (WHERE watch_seconds > 0)::int AS attended,
              count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed,
              avg(watch_seconds) FILTER (WHERE watch_seconds > 0) AS avg_watch_seconds
       FROM combined
       GROUP BY session_start_at ORDER BY session_start_at DESC LIMIT 20`,
      [webinarId],
    ),
  ]);

  const webinar = webinarResult.rows[0];
  if (!webinar) notFound();

  const summary = summaryResult.rows[0];
  const total = Number(summary?.total || 0);
  const attended = Number(summary?.attended || 0);
  const completed = Number(summary?.completed || 0);
  const avgWatchSeconds = summary?.avg_watch_seconds != null ? Math.round(Number(summary.avg_watch_seconds)) : null;
  const attendanceRate = total > 0 ? Math.round((attended / total) * 100) : null;
  const completionRate = attended > 0 ? Math.round((completed / attended) * 100) : null;

  return (
    <div>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-soft">Attendee management</p>
        <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{webinar.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">How this webinar is actually performing, across every broadcast.</p>
      </div>
      <ConsoleWebinarTabs webinarId={webinarId} active="analytics" />

      {total === 0 ? (
        <p className="mt-8 text-sm text-ink-soft">No registrations yet. Stats will show up here once there are some.</p>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Registrations" value={total} />
            <Stat label="Attended" value={attended} />
            <Stat label="Attendance rate" value={attendanceRate != null ? `${attendanceRate}%` : "No data"} />
            <Stat label="Completion rate" value={completionRate != null ? `${completionRate}%` : "No data"} />
            <Stat label="Avg. watch time" value={avgWatchSeconds != null ? `${Math.floor(avgWatchSeconds / 60)}m ${avgWatchSeconds % 60}s` : "No data yet"} />
          </div>

          <div className="mt-8">
            <h3 className="text-sm font-medium">Broadcast comparison</h3>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-paper">
              <table className="min-w-[720px] w-full text-left text-sm">
                <thead className="border-b border-line bg-paper-soft text-ink-soft">
                  <tr><th className="p-4 font-semibold">Broadcast</th><th className="p-4 font-semibold">Registrations</th><th className="p-4 font-semibold">Attended</th><th className="p-4 font-semibold">Attendance rate</th><th className="p-4 font-semibold">Completed</th><th className="p-4 font-semibold">Avg. watch time</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {byBroadcastResult.rows.map((row) => {
                    const regs = Number(row.registrations);
                    const rowAttended = Number(row.attended);
                    const rate = regs > 0 ? Math.round((rowAttended / regs) * 100) : 0;
                    const avgSeconds = row.avg_watch_seconds != null ? Math.round(Number(row.avg_watch_seconds)) : null;
                    return (
                      <tr key={row.session_start_at}>
                        <td className="p-4">{formatWebinarSessionWindow(row.session_start_at, Number(webinar.duration_seconds || 0), "Asia/Kolkata")}</td>
                        <td className="p-4 text-ink-soft">{regs}</td>
                        <td className="p-4 text-ink-soft">{rowAttended}</td>
                        <td className="p-4 text-ink-soft">{rate}%</td>
                        <td className="p-4 text-ink-soft">{row.completed}</td>
                        <td className="p-4 text-ink-soft">{avgSeconds != null ? `${Math.floor(avgSeconds / 60)}m ${avgSeconds % 60}s` : "No data"}</td>
                      </tr>
                    );
                  })}
                  {!byBroadcastResult.rows.length && <tr><td colSpan={6} className="p-10 text-center text-ink-soft">No completed broadcasts yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
