"use client";

import { useEffect, useState } from "react";

type WeekBooking = { id: number; attendee_name: string; attendee_email: string; scheduled_start: string; status: string; meeting_type_name: string };

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export default function ConsoleMeetingsWeekView() {
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [bookings, setBookings] = useState<WeekBooking[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [todayKey, setTodayKey] = useState<string | null>(null);

  // Resolve the current week/today on the client so the server-rendered
  // pass (possibly in a different timezone) doesn't produce a different
  // week grid or "today" highlight than the browser.
  useEffect(() => {
    const now = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeekStart((w) => w ?? startOfWeek(now));
    setTodayKey(toDateKey(now));
  }, []);

  useEffect(() => {
    if (!weekStart) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/console/meetings/week?start=${toDateKey(weekStart)}`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setBookings(body.bookings || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  if (!weekStart) return null;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const byDay = new Map<string, WeekBooking[]>();
  for (const b of bookings || []) {
    const key = toDateKey(new Date(b.scheduled_start));
    byDay.set(key, [...(byDay.get(key) || []), b]);
  }

  const rangeLabel = `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} to ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{rangeLabel}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink">
            This week
          </button>
          <button type="button" onClick={() => setWeekStart((d) => { const base = d ?? new Date(); const n = new Date(base); n.setDate(n.getDate() - 7); return n; })} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink">
            Previous
          </button>
          <button type="button" onClick={() => setWeekStart((d) => { const base = d ?? new Date(); const n = new Date(base); n.setDate(n.getDate() + 7); return n; })} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink">
            Next
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-7">
        {days.map((day) => {
          const key = toDateKey(day);
          const dayBookings = (byDay.get(key) || []).sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
          return (
            <div key={key} className={`rounded-2xl border p-3 ${key === todayKey ? "border-ink" : "border-line"}`}>
              <p className="text-xs font-medium text-ink-soft">{day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
              <div className="mt-2 space-y-1.5">
                {loading ? (
                  <p className="text-xs text-ink-soft">Loading…</p>
                ) : dayBookings.length ? (
                  dayBookings.map((b) => (
                    <div key={b.id} className="rounded-lg bg-paper-soft px-2 py-1.5">
                      <p className="text-xs font-medium">{new Date(b.scheduled_start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
                      <p className="truncate text-xs text-ink-soft" title={b.attendee_name}>{b.attendee_name}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-ink-soft">Nothing booked</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
