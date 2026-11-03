export type Weekday = "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";
export type TimeRange = { start: string; end: string };
/** `blocked` is a UI-only convenience: a blocked date is sent to Cal.com as
 * a zero-width override (start === end === "00:00"), which produces zero
 * bookable slots for that date under any reasonable interval-based slot
 * generator -- this doesn't depend on any Cal.com-specific "unavailable"
 * flag, which the v2 API's own schema doesn't document. */
export type DateOverride = { date: string; start: string; end: string; blocked: boolean };
export type CalcomAvailabilitySlot = { days: Weekday[]; startTime: string; endTime: string };
export type CalcomScheduleOverride = { date: string; startTime: string; endTime: string };

export const WEEKDAYS: Weekday[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Cal.com's `availability` is a flat list of {days[], startTime, endTime}
 * slots -- a single day can legitimately appear in more than one slot (a
 * lunch-break split: free 9-12 and free again 2-5). Groups them back into
 * one ordered list of ranges per weekday, preserving every range instead of
 * collapsing to the last one seen for that day. */
export function slotsToRangesByDay(slots: CalcomAvailabilitySlot[]): Record<Weekday, TimeRange[]> {
  const state = Object.fromEntries(WEEKDAYS.map((d) => [d, [] as TimeRange[]])) as Record<Weekday, TimeRange[]>;
  for (const slot of slots) {
    for (const day of slot.days) {
      if (WEEKDAYS.includes(day)) state[day].push({ start: slot.startTime, end: slot.endTime });
    }
  }
  return state;
}

/** Inverse of slotsToRangesByDay. Cal.com's own shape lets one slot cover
 * multiple days, but this app edits per-day, so each range becomes its own
 * single-day slot -- simpler round-trip, and Cal.com treats the result the
 * same either way. */
export function rangesByDayToSlots(rangesByDay: Record<Weekday, TimeRange[]>): CalcomAvailabilitySlot[] {
  const slots: CalcomAvailabilitySlot[] = [];
  for (const day of WEEKDAYS) {
    for (const range of rangesByDay[day]) slots.push({ days: [day], startTime: range.start, endTime: range.end });
  }
  return slots;
}

export function overridesToState(overrides: CalcomScheduleOverride[]): DateOverride[] {
  return overrides
    .map((o) => ({ date: o.date, start: o.startTime, end: o.endTime, blocked: o.startTime === o.endTime }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function stateToOverrides(state: DateOverride[]): CalcomScheduleOverride[] {
  return state.map((o) => ({
    date: o.date,
    startTime: o.blocked ? "00:00" : o.start,
    endTime: o.blocked ? "00:00" : o.end,
  }));
}
