import test from "node:test";
import assert from "node:assert/strict";
import { dueWebinarEmailType, formatWebinarSessionWindow } from "../src/lib/webinarReminders.ts";

const start = new Date("2026-09-01T12:00:00.000Z");

test("webinar email windows select 24h and 1h reminders", () => {
  assert.equal(dueWebinarEmailType(start, 540, new Date("2026-08-31T12:01:00.000Z")), "24h");
  assert.equal(dueWebinarEmailType(start, 540, new Date("2026-09-01T11:01:00.000Z")), "1h");
});

test("formats the complete attendee-local broadcast window", () => {
  const value = formatWebinarSessionWindow("2026-09-02T03:30:00.000Z", 1800, "Asia/Kolkata");
  assert.match(value, /9:00\s*am/i);
  assert.match(value, /9:30\s*am/i);
  assert.match(value, /IST/);
});

test("webinar follow-up is due only after the session ends", () => {
  assert.equal(dueWebinarEmailType(start, 540, new Date("2026-09-01T12:08:59.000Z")), null);
  assert.equal(dueWebinarEmailType(start, 540, new Date("2026-09-01T12:09:01.000Z")), "follow_up");
  assert.equal(dueWebinarEmailType(start, 540, new Date("2026-09-01T13:10:00.000Z")), null);
});
