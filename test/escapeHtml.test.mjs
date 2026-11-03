import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../src/lib/escapeHtml.ts";

test("escapeHtml escapes all critical characters", () => {
  assert.equal(escapeHtml("&"), "&amp;");
  assert.equal(escapeHtml("<"), "&lt;");
  assert.equal(escapeHtml(">"), "&gt;");
  assert.equal(escapeHtml('"'), "&quot;");
  assert.equal(escapeHtml("'"), "&#39;");
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), "&lt;img src=x onerror=alert(1)&gt;");
});

test("escapeHtml handles combined payloads", () => {
  const input = `Tom & Jerry's "Great" < Adventure >`;
  assert.equal(escapeHtml(input), `Tom &amp; Jerry&#39;s &quot;Great&quot; &lt; Adventure &gt;`);
});

test("escapeHtml handles empty and plain strings", () => {
  assert.equal(escapeHtml(""), "");
  assert.equal(escapeHtml("hello world"), "hello world");
  assert.equal(escapeHtml("123"), "123");
});

test("escapeHtml coerces non-string via String()", () => {
  // The function does String(value) at the top, so numbers/booleans/null are handled
  assert.equal(escapeHtml(null), "null");
  assert.equal(escapeHtml(undefined), "undefined");
});
