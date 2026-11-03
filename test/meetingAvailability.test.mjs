import assert from "node:assert/strict";
import test from "node:test";

test("slotsToRangesByDay preserves every range for a day, not just the last one seen", async () => {
  const { slotsToRangesByDay } = await import("../src/lib/meetingAvailability.ts");
  const slots = [
    { days: ["Monday"], startTime: "09:00", endTime: "12:00" },
    { days: ["Monday"], startTime: "14:00", endTime: "17:00" },
    { days: ["Tuesday", "Wednesday"], startTime: "10:00", endTime: "16:00" },
  ];
  const byDay = slotsToRangesByDay(slots);
  assert.deepEqual(byDay.Monday, [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "17:00" }]);
  assert.deepEqual(byDay.Tuesday, [{ start: "10:00", end: "16:00" }]);
  assert.deepEqual(byDay.Wednesday, [{ start: "10:00", end: "16:00" }]);
  assert.deepEqual(byDay.Sunday, []);
});

test("rangesByDayToSlots is the inverse of slotsToRangesByDay for round-tripping", async () => {
  const { slotsToRangesByDay, rangesByDayToSlots, WEEKDAYS } = await import("../src/lib/meetingAvailability.ts");
  const original = [
    { days: ["Monday"], startTime: "09:00", endTime: "12:00" },
    { days: ["Monday"], startTime: "14:00", endTime: "17:00" },
    { days: ["Friday"], startTime: "10:00", endTime: "16:00" },
  ];
  const roundTripped = rangesByDayToSlots(slotsToRangesByDay(original));
  const sortKey = (s) => `${WEEKDAYS.indexOf(s.days[0])}-${s.startTime}`;
  assert.deepEqual([...roundTripped].sort((a, b) => sortKey(a).localeCompare(sortKey(b))), [...original].sort((a, b) => sortKey(a).localeCompare(sortKey(b))));
});

test("overridesToState marks a zero-width override as blocked and sorts by date", async () => {
  const { overridesToState } = await import("../src/lib/meetingAvailability.ts");
  const state = overridesToState([
    { date: "2026-12-25", startTime: "00:00", endTime: "00:00" },
    { date: "2026-11-01", startTime: "10:00", endTime: "12:00" },
  ]);
  assert.deepEqual(state, [
    { date: "2026-11-01", start: "10:00", end: "12:00", blocked: false },
    { date: "2026-12-25", start: "00:00", end: "00:00", blocked: true },
  ]);
});

test("stateToOverrides sends a zero-width range for a blocked date regardless of its stored hours", async () => {
  const { stateToOverrides } = await import("../src/lib/meetingAvailability.ts");
  const overrides = stateToOverrides([
    { date: "2026-12-25", start: "09:00", end: "17:00", blocked: true },
    { date: "2026-11-01", start: "10:00", end: "12:00", blocked: false },
  ]);
  assert.deepEqual(overrides, [
    { date: "2026-12-25", startTime: "00:00", endTime: "00:00" },
    { date: "2026-11-01", startTime: "10:00", endTime: "12:00" },
  ]);
});
