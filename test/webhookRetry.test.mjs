import test from "node:test";
import assert from "node:assert/strict";
import { classifyHttpStatus, nextBackoffDelayMs, MAX_DELIVERY_ATTEMPTS } from "../src/lib/webhookRetry.ts";

test("2xx statuses classify as delivered", () => {
  assert.equal(classifyHttpStatus(200), "delivered");
  assert.equal(classifyHttpStatus(201), "delivered");
  assert.equal(classifyHttpStatus(299), "delivered");
});

test("408 and 429 classify as retryable (transient)", () => {
  assert.equal(classifyHttpStatus(408), "retryable_failure");
  assert.equal(classifyHttpStatus(429), "retryable_failure");
});

test("other 4xx statuses classify as permanent (no point retrying a rejected request)", () => {
  assert.equal(classifyHttpStatus(400), "permanent_failure");
  assert.equal(classifyHttpStatus(401), "permanent_failure");
  assert.equal(classifyHttpStatus(404), "permanent_failure");
  assert.equal(classifyHttpStatus(422), "permanent_failure");
});

test("3xx redirects classify as retryable, not followed", () => {
  assert.equal(classifyHttpStatus(301), "retryable_failure");
  assert.equal(classifyHttpStatus(302), "retryable_failure");
});

test("5xx statuses classify as retryable", () => {
  assert.equal(classifyHttpStatus(500), "retryable_failure");
  assert.equal(classifyHttpStatus(503), "retryable_failure");
});

test("backoff delay is non-decreasing and bounded across the attempt range", () => {
  let previous = 0;
  for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS + 3; attempt++) {
    const delay = nextBackoffDelayMs(attempt);
    assert.ok(delay >= previous, `attempt ${attempt}: ${delay} should be >= ${previous}`);
    previous = delay;
  }
});

test("backoff delay never exceeds 24 hours and is stable past the schedule length", () => {
  const far1 = nextBackoffDelayMs(50);
  const far2 = nextBackoffDelayMs(1000);
  assert.equal(far1, far2);
  assert.ok(far1 <= 24 * 60 * 60 * 1000);
});

test("backoff delay handles attempt 0 or negative safely", () => {
  assert.doesNotThrow(() => nextBackoffDelayMs(0));
  assert.doesNotThrow(() => nextBackoffDelayMs(-5));
});
