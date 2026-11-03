import assert from "node:assert/strict";
import test from "node:test";

test("meeting reminder windows select 24h and 1h reminders", async () => {
  const { dueMeetingReminderType } = await import("../src/lib/meetingReminders.ts");
  const now = new Date("2026-08-29T12:00:00.000Z");
  assert.equal(dueMeetingReminderType(new Date("2026-08-30T12:00:00.000Z"), now), "24h");
  assert.equal(dueMeetingReminderType(new Date("2026-08-30T11:59:59.000Z"), now), "24h");
  assert.equal(dueMeetingReminderType(new Date("2026-08-29T13:00:00.000Z"), now), "1h");
  assert.equal(dueMeetingReminderType(new Date("2026-08-29T12:59:59.000Z"), now), "1h");
  assert.equal(dueMeetingReminderType(new Date("2026-08-30T12:00:01.000Z"), now), null);
  assert.equal(dueMeetingReminderType(new Date("2026-08-29T11:59:59.000Z"), now), null);
  assert.equal(dueMeetingReminderType("not-a-date", now), null);
});

test("24h reminder is skipped for a booking made less than ~20h before its own call, but 1h still fires", async () => {
  const { dueMeetingReminderType } = await import("../src/lib/meetingReminders.ts");
  const now = new Date("2026-08-29T12:00:00.000Z");
  const scheduledStart = new Date("2026-08-30T06:00:00.000Z"); // 18h out
  const bookedJustNow = new Date("2026-08-29T11:00:00.000Z"); // booked 19h before the call
  const bookedLongAgo = new Date("2026-08-01T00:00:00.000Z"); // booked weeks ago
  assert.equal(dueMeetingReminderType(scheduledStart, now, bookedJustNow), null);
  assert.equal(dueMeetingReminderType(scheduledStart, now, bookedLongAgo), "24h");
  assert.equal(dueMeetingReminderType(scheduledStart, now, null), "24h");
  const oneHourOut = new Date("2026-08-29T12:30:00.000Z");
  assert.equal(dueMeetingReminderType(oneHourOut, now, bookedJustNow), "1h");
});
