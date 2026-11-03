import test from "node:test";
import assert from "node:assert/strict";
import { getLevelInfo, LEVELS } from "../src/lib/gamification.ts";

test("getLevelInfo returns level 1 for 0 and negative points", () => {
  assert.equal(getLevelInfo(0).level, 1);
  assert.equal(getLevelInfo(0).name, "Newbie");
  assert.equal(getLevelInfo(-10).level, 1);
  assert.equal(getLevelInfo(undefined).level, 1);
});

test("getLevelInfo thresholds are exact", () => {
  assert.equal(getLevelInfo(5).level, 2);
  assert.equal(getLevelInfo(4).level, 1);
  assert.equal(getLevelInfo(20).level, 3);
  assert.equal(getLevelInfo(65).level, 4);
  assert.equal(getLevelInfo(155).level, 5);
  assert.equal(getLevelInfo(515).level, 6);
  assert.equal(getLevelInfo(1450).level, 7);
  assert.equal(getLevelInfo(3850).level, 8);
  assert.equal(getLevelInfo(10000).level, 9);
  assert.equal(getLevelInfo(20000).level, 9);
});

test("getLevelInfo progressPercent is 100 at max level", () => {
  const info = getLevelInfo(10000);
  assert.equal(info.level, 9);
  assert.equal(info.progressPercent, 100);
  assert.equal(info.nextLevelPoints, null);
});

test("getLevelInfo progressPercent is in range", () => {
  const info = getLevelInfo(10); // level 2 is 5-20, so 5/15 = 33%
  assert.equal(info.level, 2);
  assert.ok(info.progressPercent >= 0 && info.progressPercent <= 100);
  assert.equal(info.nextLevelPoints, 20);
  // Midpoint: 12 points should be about 46% (7/15)
  const mid = getLevelInfo(12);
  assert.equal(mid.level, 2);
  assert.ok(mid.progressPercent > 30 && mid.progressPercent < 60);
});

test("LEVELS are sorted and have 9 entries", () => {
  assert.equal(LEVELS.length, 9);
  for (let i = 1; i < LEVELS.length; i++) {
    assert.ok(LEVELS[i].minPoints > LEVELS[i - 1].minPoints);
  }
});
