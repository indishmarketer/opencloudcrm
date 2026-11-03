import test from "node:test";
import assert from "node:assert/strict";
import { webinarSessionState } from "../src/lib/webinarSession.ts";

const start = "2026-09-01T12:00:00.000Z";

test("webinar session waits, advances with wall clock, and ends permanently", () => {
  assert.deepEqual(webinarSessionState(start, 540, new Date("2026-09-01T11:59:00.000Z")), { phase: "waiting", elapsedSeconds: 0 });
  assert.deepEqual(webinarSessionState(start, 540, new Date("2026-09-01T12:04:00.000Z")), { phase: "live", elapsedSeconds: 240 });
  assert.deepEqual(webinarSessionState(start, 540, new Date("2026-09-01T12:09:00.000Z")), { phase: "ended", elapsedSeconds: 540 });
});

test("rejoining uses elapsed session time rather than starting over", () => {
  const rejoined = webinarSessionState(start, 540, new Date("2026-09-01T12:07:30.000Z"));
  assert.equal(rejoined.phase, "live");
  assert.equal(rejoined.elapsedSeconds, 450);
});
