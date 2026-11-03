import test from "node:test";
import assert from "node:assert/strict";
import { serializeJsonLd } from "../src/lib/jsonLd.ts";

test("serializeJsonLd escapes < to prevent XSS", () => {
  const out = serializeJsonLd({ html: "<script>alert(1)</script>" });
  assert.ok(!out.includes("<script>"));
  assert.ok(out.includes("\\u003cscript>"));
});

test("serializeJsonLd handles normal values", () => {
  const out = serializeJsonLd({ a: 1, b: "hello" });
  assert.equal(out, JSON.stringify({ a: 1, b: "hello" }).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"));
});

test("serializeJsonLd escapes line and paragraph separators", () => {
  const withSeparators = { t: "a\u2028b\u2029c" };
  const out = serializeJsonLd(withSeparators);
  assert.ok(out.includes("\\u2028"));
  assert.ok(out.includes("\\u2029"));
});
