import test from "node:test";
import assert from "node:assert/strict";
import { gaClientIdFrom, gaSessionIdFrom } from "../src/lib/ga4Server.ts";

test("reads the GA4 client id from the _ga cookie", () => {
  assert.equal(gaClientIdFrom("GA1.1.123456789.1700000000"), "123456789.1700000000");
  assert.equal(gaClientIdFrom("GA1.2.987.1600000000"), "987.1600000000");
  assert.equal(gaClientIdFrom(undefined), null);
  assert.equal(gaClientIdFrom("junk"), null);
});

test("reads the session id from both _ga_<id> cookie formats", () => {
  assert.equal(gaSessionIdFrom("GS1.1.1700000000.3.1.1700000100.0.0.0"), "1700000000");
  assert.equal(gaSessionIdFrom("GS2.1.s1760100000$o4$g1$t1760100300$j60$l0$h0"), "1760100000");
  assert.equal(gaSessionIdFrom(null), null);
  assert.equal(gaSessionIdFrom("nope"), null);
});
