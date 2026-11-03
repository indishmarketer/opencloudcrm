import { pool } from "@/lib/db";
import ConsoleMeetingsTabs from "@/components/ConsoleMeetingsTabs";

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{label}</p>
    </div>
  );
}

export default async function ConsoleMeetingsAnalyticsPage() {
  const [summaryResult, weeklyResult, weekdayResult] = await Promise.all([
    pool.query(`
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE status = 'completed') AS completed,
        count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        count(*) FILTER (WHERE guest_no_show) AS guest_no_shows,
        count(*) FILTER (WHERE host_no_show) AS host_no_shows,
        avg(EXTRACT(EPOCH FROM (actual_end_at - actual_start_at)) / 60) FILTER (WHERE actual_start_at IS NOT NULL AND actual_end_at IS NOT NULL) AS avg_duration_minutes
      FROM meeting_bookings
      WHERE scheduled_start >= now() - interval '90 days'
    `),
    pool.query(`
      SELECT date_trunc('week', scheduled_start) AS week, count(*) AS count
      FROM meeting_bookings
      WHERE scheduled_start >= now() - interval '8 weeks' AND scheduled_start < now()
      GROUP BY week ORDER BY week ASC
    `),
    pool.query(`
      SELECT EXTRACT(DOW FROM scheduled_start)::int AS dow, count(*) AS count
      FROM meeting_bookings
      WHERE scheduled_start >= now() - interval '90 days' AND status IN ('confirmed', 'completed')
      GROUP BY dow ORDER BY count DESC
    `),
  ]);

  const summary = summaryResult.rows[0];
  const total = Number(summary?.total || 0);
  const completed = Number(summary?.completed || 0);
  const cancelled = Number(summary?.cancelled || 0);
  const guestNoShows = Number(summary?.guest_no_shows || 0);
  const hostNoShows = Number(summary?.host_no_shows || 0);
  const avgDuration = summary?.avg_duration_minutes != null ? Math.round(Number(summary.avg_duration_minutes)) : null;
  const endedCount = completed + guestNoShows;
  const noShowRate = endedCount > 0 ? Math.round((guestNoShows / endedCount) * 100) : null;
  const cancellationRate = total > 0 ? Math.round((cancelled / total) * 100) : null;

  const weeklyMax = Math.max(1, ...weeklyResult.rows.map((r) => Number(r.count)));
  const busiestDay = weekdayResult.rows[0] ? WEEKDAY_LABELS[weekdayResult.rows[0].dow] : null;

  return (
    <div>
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Meetings</h1>
        <p className="mt-2 text-sm text-ink-soft">How your booking funnel is actually performing, last 90 days.</p>
      </div>
      <div className="mt-6"><ConsoleMeetingsTabs /></div>

      {total === 0 ? (
        <p className="mt-8 text-sm text-ink-soft">No bookings in the last 90 days yet. Stats will show up here once there are some.</p>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Bookings" value={total} />
            <Stat label="Completed" value={completed} />
            <Stat label="Cancelled" value={cancellationRate != null ? `${cancellationRate}%` : "No data"} />
            <Stat label="Guest no-show rate" value={noShowRate != null ? `${noShowRate}%` : "No data"} />
            <Stat label="Host no-shows" value={hostNoShows} />
            <Stat label="Avg. call length" value={avgDuration != null ? `${avgDuration} min` : "No data yet"} />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium">Bookings per week</h3>
              <div className="mt-3 flex items-end gap-2 rounded-2xl border border-line bg-paper p-4" style={{ height: 140 }}>
                {weeklyResult.rows.map((row) => {
                  const count = Number(row.count);
                  const heightPct = Math.max(4, Math.round((count / weeklyMax) * 100));
                  const weekLabel = new Date(row.week).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                  return (
                    <div key={row.week} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${count} booking${count === 1 ? "" : "s"} for the week of ${weekLabel}`}>
                      <div className="w-full rounded-t bg-ink" style={{ height: `${heightPct}%` }} />
                      <span className="text-[10px] text-ink-soft">{weekLabel}</span>
                    </div>
                  );
                })}
                {!weeklyResult.rows.length && <p className="text-sm text-ink-soft">No bookings in the last 8 weeks.</p>}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium">Busiest day of the week</h3>
              <div className="mt-3 rounded-2xl border border-line bg-paper p-4">
                {busiestDay ? (
                  <>
                    <p className="text-2xl font-semibold">{busiestDay}</p>
                    <p className="mt-1 text-xs text-ink-soft">Based on scheduled call times over the last 90 days, in UTC.</p>
                    <div className="mt-4 space-y-2">
                      {weekdayResult.rows.map((row) => (
                        <div key={row.dow} className="flex items-center justify-between text-sm">
                          <span className="text-ink-soft">{WEEKDAY_LABELS[row.dow]}</span>
                          <span className="font-medium">{row.count}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-ink-soft">Not enough data yet.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
