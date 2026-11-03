"use client";

import { useState } from "react";
import BrandDatePicker from "@/components/BrandDatePicker";
import BrandSelect from "@/components/BrandSelect";
import {
  WEEKDAYS,
  slotsToRangesByDay,
  rangesByDayToSlots,
  overridesToState,
  stateToOverrides,
  type Weekday,
  type TimeRange,
  type DateOverride,
  type CalcomAvailabilitySlot,
  type CalcomScheduleOverride,
} from "@/lib/meetingAvailability";

type Schedule = { id: number; name: string; timeZone: string; availability: CalcomAvailabilitySlot[]; overrides: CalcomScheduleOverride[] };

const DEFAULT_RANGE: TimeRange = { start: "09:00", end: "17:00" };

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// A curated common-timezone list, not the full ~400-entry IANA set --
// unlike the visitor-facing booking widget (any country, so the full list
// there makes sense), the owner only ever needs their own real timezone
// here. Their current one is always included even if it's not in this list.
const COMMON_TIMEZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai",
  "Europe/London", "Europe/Paris", "Europe/Berlin",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Australia/Sydney", "Pacific/Auckland", "UTC",
];

export default function ConsoleMeetingAvailability({ schedule }: { schedule: Schedule }) {
  const [rangesByDay, setRangesByDay] = useState<Record<Weekday, TimeRange[]>>(() => slotsToRangesByDay(schedule.availability));
  const [overrides, setOverrides] = useState<DateOverride[]>(() => overridesToState(schedule.overrides));
  const [timeZone, setTimeZone] = useState(schedule.timeZone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function touch() { setSaved(false); setError(""); }

  function toggleDay(day: Weekday, on: boolean) {
    touch();
    setRangesByDay((r) => ({ ...r, [day]: on ? [{ ...DEFAULT_RANGE }] : [] }));
  }
  function updateRange(day: Weekday, index: number, patch: Partial<TimeRange>) {
    touch();
    setRangesByDay((r) => ({ ...r, [day]: r[day].map((range, i) => (i === index ? { ...range, ...patch } : range)) }));
  }
  function addRange(day: Weekday) {
    touch();
    setRangesByDay((r) => ({ ...r, [day]: [...r[day], { ...DEFAULT_RANGE }] }));
  }
  function removeRange(day: Weekday, index: number) {
    touch();
    setRangesByDay((r) => ({ ...r, [day]: r[day].filter((_, i) => i !== index) }));
  }

  function addOverride() {
    touch();
    setOverrides((list) => [...list, { date: todayDateKey(), start: "09:00", end: "17:00", blocked: true }]);
  }
  function updateOverride(index: number, patch: Partial<DateOverride>) {
    touch();
    setOverrides((list) => list.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }
  function removeOverride(index: number) {
    touch();
    setOverrides((list) => list.filter((_, i) => i !== index));
  }

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    const availability = rangesByDayToSlots(rangesByDay);
    if (!availability.length) {
      setError("Turn on at least one day, or nothing will ever be bookable.");
      setBusy(false);
      return;
    }
    for (const day of WEEKDAYS) {
      for (const range of rangesByDay[day]) {
        if (range.start >= range.end) {
          setError(`${day}: each time range needs a start before its end.`);
          setBusy(false);
          return;
        }
      }
    }
    const dateSeen = new Set<string>();
    for (const o of overrides) {
      if (!o.date) { setError("Every date override needs a date."); setBusy(false); return; }
      if (dateSeen.has(o.date)) { setError(`${o.date} is listed more than once.`); setBusy(false); return; }
      dateSeen.add(o.date);
      if (!o.blocked && o.start >= o.end) { setError(`${o.date}: custom hours need a start before its end.`); setBusy(false); return; }
    }
    try {
      const res = await fetch("/api/console/meetings/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeZone, availability, overrides: stateToOverrides(overrides) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) { setError(body?.error || "Could not save."); return; }
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  const timeZoneOptions = (COMMON_TIMEZONES.includes(timeZone) ? COMMON_TIMEZONES : [timeZone, ...COMMON_TIMEZONES]).map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }));

  return (
    <div className="mt-6 max-w-2xl">
      <div className="rounded-2xl border border-line bg-paper p-6">
        <label className="text-xs font-medium text-ink-soft">Your timezone</label>
        <BrandSelect value={timeZone} onChange={(v) => { setTimeZone(v); touch(); }} options={timeZoneOptions} className="mt-1 max-w-sm" />
        <p className="mt-1 text-xs text-ink-soft">All hours below are in this timezone. Visitors always see them converted to their own.</p>

        <div className="mt-6 space-y-2">
          {WEEKDAYS.map((day) => {
            const ranges = rangesByDay[day];
            const enabled = ranges.length > 0;
            return (
              <div key={day} className="rounded-lg border border-line px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleDay(day, !enabled)}
                    className={`w-28 shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium text-left ${enabled ? "border-ink bg-ink text-paper" : "border-line text-ink-soft"}`}
                  >
                    {day}
                  </button>
                  {!enabled && <span className="text-sm text-ink-soft">Not bookable</span>}
                </div>
                {enabled && (
                  <div className="mt-2 space-y-2">
                    {ranges.map((range, i) => (
                      <div key={i} className="flex items-center gap-2 pl-1">
                        <input
                          type="time"
                          value={range.start}
                          onChange={(e) => updateRange(day, i, { start: e.target.value })}
                          className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-ink"
                        />
                        <span className="text-sm text-ink-soft">to</span>
                        <input
                          type="time"
                          value={range.end}
                          onChange={(e) => updateRange(day, i, { end: e.target.value })}
                          className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-ink"
                        />
                        {ranges.length > 1 && (
                          <button type="button" onClick={() => removeRange(day, i)} className="text-xs font-medium text-ink-soft underline hover:text-red-600">
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => addRange(day)} className="pl-1 text-xs font-medium text-ink underline underline-offset-2 hover:no-underline">
                      + Add another time range (e.g. a lunch break split)
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 border-t border-line pt-6">
          <h3 className="text-sm font-medium text-ink">Date overrides</h3>
          <p className="mt-1 text-xs text-ink-soft">One-off exceptions to your weekly hours above. Block a single date entirely, or give it different hours, without changing every future week.</p>
          <div className="mt-4 space-y-2">
            {overrides.map((o, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2.5">
                <BrandDatePicker
                  variant="input"
                  value={o.date}
                  onChange={(date) => updateOverride(i, { date })}
                  ariaLabel="Override date"
                  placeholder="Select date"
                />
                <button
                  type="button"
                  onClick={() => updateOverride(i, { blocked: !o.blocked })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${o.blocked ? "border-ink bg-ink text-paper" : "border-line text-ink-soft"}`}
                >
                  {o.blocked ? "Unavailable all day" : "Custom hours"}
                </button>
                {!o.blocked && (
                  <>
                    <input
                      type="time"
                      value={o.start}
                      onChange={(e) => updateOverride(i, { start: e.target.value })}
                      className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-ink"
                    />
                    <span className="text-sm text-ink-soft">to</span>
                    <input
                      type="time"
                      value={o.end}
                      onChange={(e) => updateOverride(i, { end: e.target.value })}
                      className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-ink"
                    />
                  </>
                )}
                <button type="button" onClick={() => removeOverride(i)} className="ml-auto text-xs font-medium text-ink-soft underline hover:text-red-600">
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addOverride} className="mt-3 text-xs font-medium text-ink underline underline-offset-2 hover:no-underline">
            + Add a date override
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {saved && <p className="mt-4 text-sm text-ink-soft">Saved. Live on your booking page now.</p>}

        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save availability"}
        </button>
      </div>
    </div>
  );
}
