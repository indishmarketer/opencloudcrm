import test from "node:test";
import assert from "node:assert/strict";
import { timeAgo } from "../src/lib/timeAgo.ts";

test("timeAgo returns just now for recent", () => {
  const now = new Date().toISOString();
  assert.equal(timeAgo(now), "just now");
});

test("timeAgo handles minutes, hours, days", () => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(timeAgo(fiveMinAgo), "5m ago");
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  assert.equal(timeAgo(twoHoursAgo), "2h ago");
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(timeAgo(threeDaysAgo), "3d ago");
});

test("timeAgo handles months and years", () => {
  const twoMonthsAgo = new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(timeAgo(twoMonthsAgo), "2mo ago");
  const twoYearsAgo = new Date(Date.now() - 800 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(timeAgo(twoYearsAgo), "2y ago");
});
