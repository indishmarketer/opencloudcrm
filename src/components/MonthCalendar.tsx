"use client";

import { useEffect, useMemo, useState } from "react";

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Calendly-style month grid: a nav header, a weekday row, then day cells in
// a 7-column grid with leading blanks so the 1st lands on its real weekday
// -- not a fixed-length horizontal strip. Navigable forward indefinitely;
// backward is capped at the current month (nothing bookable in the past).
// Shared by the new-booking widget and the self-service reschedule page.
export function MonthCalendar({ selectedDate, onSelect }: { selectedDate: string; onSelect: (dateKey: string) => void }) {
  // "today" and the initial view month are resolved client-side on mount so
  // the server-rendered pass (which may run in a different timezone) never
  // computes a different day boundary than the browser, avoiding a
  // hydration mismatch on the disabled/past/highlighted cells.
  const [today, setToday] = useState<Date | null>(null);
  const [viewMonth, setViewMonth] = useState<Date | null>(null);

  useEffect(() => {
    const t = new Date(new Date().setHours(0, 0, 0, 0));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(t);
    setViewMonth((m) => m ?? startOfMonth(t));
  }, []);

  const cells = useMemo(() => {
    if (!viewMonth) return [] as (Date | null)[];
    const first = startOfMonth(viewMonth);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const leading = first.getDay();
    const result: (Date | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= daysInMonth; day++) result.push(new Date(first.getFullYear(), first.getMonth(), day));
    return result;
  }, [viewMonth]);

  if (!today || !viewMonth) return null;

  const canGoBack = viewMonth.getTime() > startOfMonth(today).getTime();

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={!canGoBack}
          onClick={() => setViewMonth((m) => { const base = m ?? today; return new Date(base.getFullYear(), base.getMonth() - 1, 1); })}
          aria-label="Previous month"
          className="rounded-full border border-line p-2 transition-colors hover:border-ink disabled:opacity-30 disabled:hover:border-line"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <p className="font-display text-sm font-semibold">{viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
        <button
          type="button"
          onClick={() => setViewMonth((m) => { const base = m ?? today; return new Date(base.getFullYear(), base.getMonth() + 1, 1); })}
          aria-label="Next month"
          className="rounded-full border border-line p-2 transition-colors hover:border-ink"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-ink-soft">
        {WEEKDAY_LABELS.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />;
          const key = toDateKey(date);
          const isPast = date.getTime() < today.getTime();
          const isSelected = key === selectedDate;
          const isToday = key === toDateKey(today);
          return (
            <button
              key={key}
              type="button"
              disabled={isPast}
              onClick={() => onSelect(key)}
              aria-label={date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) + (isToday ? " (today)" : "")}
              aria-pressed={isSelected}
              className={`aspect-square rounded-lg text-sm font-medium transition-colors ${
                isSelected ? "bg-ink text-paper" : isPast ? "text-ink-soft opacity-30" : "hover:bg-paper-soft"
              } ${isToday && !isSelected ? "border border-ink" : ""}`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
