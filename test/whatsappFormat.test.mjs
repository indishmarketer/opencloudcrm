import test from "node:test";
import assert from "node:assert/strict";
import {
  formatMessageClock,
  formatMessageDay,
  messageDayKey,
  nameInitials,
} from "../src/lib/whatsappFormat.ts";

test("initials come from the first name and the surname", () => {
  assert.equal(nameInitials("Mohit Kumar"), "MK");
  assert.equal(nameInitials("Rohit Sharma"), "RS");
  assert.equal(nameInitials("Shubho Dey"), "SD");
});

test("a middle name is ignored, the surname still wins", () => {
  assert.equal(nameInitials("Shubhojit Kumar Dey"), "SD");
});

test("one name gives one letter, and nothing gives nothing", () => {
  assert.equal(nameInitials("Madonna"), "M");
  assert.equal(nameInitials(""), "");
  assert.equal(nameInitials(null), "");
  assert.equal(nameInitials("   "), "");
});

test("punctuation and casing do not leak into the initials", () => {
  assert.equal(nameInitials("  ashok   verma  "), "AV");
  assert.equal(nameInitials("O'Neill"), "O");
  assert.equal(nameInitials("Jean-Luc Picard"), "JP");
  // A number has no initials worth inventing: the avatar draws a glyph.
  assert.equal(nameInitials("+91 98765 43210"), "");
  assert.equal(nameInitials("919876543210"), "");
});

test("the day key is the calendar day in Asia/Kolkata, not UTC", () => {
  // 7:30pm UTC is already past midnight in Kolkata (+5:30), which is the
  // whole reason the zone is pinned: the same message was landing on two
  // different days in the list and in the thread.
  assert.equal(messageDayKey("2026-10-21T19:30:00.000Z"), "2026-10-22");
  assert.equal(messageDayKey("2026-10-21T18:29:00.000Z"), "2026-10-21");
});

test("a day reads as Today or Yesterday against the given now", () => {
  const now = "2026-10-22T10:00:00.000Z";
  assert.equal(formatMessageDay("2026-10-22T09:00:00.000Z", now), "Today");
  assert.equal(formatMessageDay("2026-10-21T09:00:00.000Z", now), "Yesterday");
  assert.equal(formatMessageDay("2026-10-19T09:00:00.000Z", now), "19 Oct");
});

test("an older year keeps its year, this year does not repeat it", () => {
  const now = "2026-10-22T10:00:00.000Z";
  assert.match(formatMessageDay("2025-03-04T09:00:00.000Z", now), /2025/);
  assert.doesNotMatch(formatMessageDay("2026-03-04T09:00:00.000Z", now), /2026/);
});

test("a message bubble carries a clock, never a date", () => {
  const clock = formatMessageClock("2026-10-22T10:32:00.000Z");
  assert.match(clock, /4:02/);
  assert.doesNotMatch(clock, /Oct|2026/);
});
