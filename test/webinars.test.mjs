import test from "node:test";
import assert from "node:assert/strict";
import { canWatchWebinar, isReleasePending } from "../src/lib/webinarGate.ts";

function makeWebinar(overrides = {}) {
  return {
    status: "published",
    release_at: null,
    requires_registration: false,
    access_tier: "free",
    ...overrides,
  };
}

test("canWatchWebinar allows free published webinar with no gating", () => {
  const w = makeWebinar();
  assert.deepEqual(canWatchWebinar({ webinar: w, isOwner: false, hasRegistered: true, hasProAccess: true }), { allowed: true });
});

test("canWatchWebinar blocks if not published", () => {
  const w = makeWebinar({ status: "processing" });
  assert.equal(canWatchWebinar({ webinar: w, isOwner: false, hasRegistered: true, hasProAccess: true }).allowed, false);
  assert.equal(canWatchWebinar({ webinar: w, isOwner: false, hasRegistered: true, hasProAccess: true }).reason, "processing");
});

test("canWatchWebinar blocks ready for non-owner but allows owner", () => {
  const w = makeWebinar({ status: "ready" });
  assert.equal(canWatchWebinar({ webinar: w, isOwner: false, hasRegistered: true, hasProAccess: true }).allowed, false);
  assert.equal(canWatchWebinar({ webinar: w, isOwner: true, hasRegistered: false, hasProAccess: false }).allowed, true);
});

test("release_at gate blocks until release time in visitor local time (render-time gate)", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h future
  const w = makeWebinar({ release_at: future });
  const now = new Date();
  assert.equal(canWatchWebinar({ webinar: w, isOwner: false, hasRegistered: true, hasProAccess: true, now }).allowed, false);
  assert.equal(canWatchWebinar({ webinar: w, isOwner: false, hasRegistered: true, hasProAccess: true, now }).reason, "release_pending");
  // Owner bypasses release gate
  assert.equal(canWatchWebinar({ webinar: w, isOwner: true, hasRegistered: false, hasProAccess: false, now }).allowed, true);
  // After release, allowed
  const past = new Date(Date.now() - 1000).toISOString();
  const w2 = makeWebinar({ release_at: past });
  assert.equal(canWatchWebinar({ webinar: w2, isOwner: false, hasRegistered: true, hasProAccess: true, now }).allowed, true);
});

test("requires_registration gate blocks unregistered visitor", () => {
  const w = makeWebinar({ requires_registration: true });
  assert.equal(canWatchWebinar({ webinar: w, isOwner: false, hasRegistered: false, hasProAccess: true }).reason, "requires_registration");
  assert.equal(canWatchWebinar({ webinar: w, isOwner: false, hasRegistered: true, hasProAccess: true }).allowed, true);
  // Owner bypasses
  assert.equal(canWatchWebinar({ webinar: w, isOwner: true, hasRegistered: false, hasProAccess: false }).allowed, true);
});

test("access_tier pro gate blocks non-pro", () => {
  const w = makeWebinar({ access_tier: "pro" });
  assert.equal(canWatchWebinar({ webinar: w, isOwner: false, hasRegistered: true, hasProAccess: false }).reason, "requires_pro");
  assert.equal(canWatchWebinar({ webinar: w, isOwner: false, hasRegistered: true, hasProAccess: true }).allowed, true);
  assert.equal(canWatchWebinar({ webinar: w, isOwner: true, hasRegistered: true, hasProAccess: false }).allowed, true);
});

test("canWatchWebinar priority: archived/errored override other gates", () => {
  const future = new Date(Date.now() + 3600000).toISOString();
  const w = makeWebinar({ status: "archived", release_at: future, requires_registration: false, access_tier: "free" });
  assert.equal(canWatchWebinar({ webinar: w, isOwner: true, hasRegistered: true, hasProAccess: true }).reason, "archived");
  const w2 = makeWebinar({ status: "errored" });
  assert.equal(canWatchWebinar({ webinar: w2, isOwner: true, hasRegistered: true, hasProAccess: true }).reason, "errored");
});

test("canWatchWebinar allows published ready without mux details once gates pass", () => {
  const w = makeWebinar({ status: "published", release_at: null, requires_registration: false, access_tier: "free" });
  assert.equal(canWatchWebinar({ webinar: w, isOwner: false, hasRegistered: true, hasProAccess: true }).allowed, true);
});

test("isReleasePending mirrors canWatchWebinar release logic for pure date checks", () => {
  assert.equal(isReleasePending(null), false);
  assert.equal(isReleasePending(new Date(Date.now() + 10000).toISOString()), true);
  assert.equal(isReleasePending(new Date(Date.now() - 10000).toISOString()), false);
  assert.equal(isReleasePending("not-a-date"), false);
});

test("combined gates: registration takes precedence over release_pending (can register ahead of release)", () => {
  const future = new Date(Date.now() + 3600000).toISOString();
  const w = makeWebinar({ release_at: future, requires_registration: true, access_tier: "free", status: "published" });
  const res = canWatchWebinar({ webinar: w, isOwner: false, hasRegistered: false, hasProAccess: true });
  assert.equal(res.reason, "requires_registration");
});

test("combined gates: once registered, release_pending still blocks until release", () => {
  const future = new Date(Date.now() + 3600000).toISOString();
  const w = makeWebinar({ release_at: future, requires_registration: true, access_tier: "free", status: "published" });
  const res = canWatchWebinar({ webinar: w, isOwner: false, hasRegistered: true, hasProAccess: true });
  assert.equal(res.reason, "release_pending");
});
