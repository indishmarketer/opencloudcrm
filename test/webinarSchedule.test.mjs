import test from "node:test";
import assert from "node:assert/strict";
import { isOfferedWebinarSession, localScheduleToUtc, upcomingWebinarSessions } from "../src/lib/webinarSchedule.ts";

test("converts an India-local webinar time to UTC", () => {
  assert.equal(localScheduleToUtc("2026-09-01", "18:30", "Asia/Kolkata")?.toISOString(), "2026-09-01T13:00:00.000Z");
});

test("weekly schedules support multiple days in one rule", () => {
  const sessions = upcomingWebinarSessions([{
    schedule_kind: "weekly", timezone: "Asia/Kolkata", weekdays: [2, 4], specific_date: null, local_time: "18:30:00", active: true,
  }], new Date("2026-08-31T00:00:00.000Z"), 4, 14);
  assert.deepEqual(sessions, [
    "2026-09-01T13:00:00.000Z", "2026-09-03T13:00:00.000Z",
    "2026-09-08T13:00:00.000Z", "2026-09-10T13:00:00.000Z",
  ]);
});

test("specific dates and weekly rules are combined, sorted, and validated", () => {
  const rules = [
    { schedule_kind: "specific", timezone: "Asia/Kolkata", weekdays: [], specific_date: "2026-09-02", local_time: "20:00:00", active: true },
    { schedule_kind: "weekly", timezone: "Asia/Kolkata", weekdays: [2], specific_date: null, local_time: "18:30:00", active: true },
  ];
  const now = new Date("2026-08-31T00:00:00.000Z");
  const sessions = upcomingWebinarSessions(rules, now, 3, 14);
  assert.deepEqual(sessions, ["2026-09-01T13:00:00.000Z", "2026-09-02T14:30:00.000Z", "2026-09-08T13:00:00.000Z"]);
  assert.equal(isOfferedWebinarSession("2026-09-02T14:30:00.000Z", rules, now), true);
  assert.equal(isOfferedWebinarSession("2026-09-02T15:30:00.000Z", rules, now), false);
});

test("a running broadcast remains joinable but disappears exactly when it ends", () => {
  const rules = [{ schedule_kind: "specific", timezone: "UTC", weekdays: [], specific_date: "2026-09-02", local_time: "09:00:00", active: true }];
  const late = new Date("2026-09-02T09:15:00.000Z");
  assert.deepEqual(upcomingWebinarSessions(rules, late, 12, 366, 1800), ["2026-09-02T09:00:00.000Z"]);
  assert.equal(isOfferedWebinarSession("2026-09-02T09:00:00.000Z", rules, late, 1800), true);

  const ended = new Date("2026-09-02T09:30:00.000Z");
  assert.deepEqual(upcomingWebinarSessions(rules, ended, 12, 366, 1800), []);
  assert.equal(isOfferedWebinarSession("2026-09-02T09:00:00.000Z", rules, ended, 1800), false);
});
