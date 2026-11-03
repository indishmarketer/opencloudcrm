import test from "node:test";
import assert from "node:assert/strict";
import { firstNameOf, applyVars } from "../src/lib/emailAutomation.ts";

test("firstNameOf extracts first name", () => {
  assert.equal(firstNameOf("Shubho Dey"), "Shubho");
  assert.equal(firstNameOf("  Alice   Bob  "), "Alice");
  assert.equal(firstNameOf("Single"), "Single");
  assert.equal(firstNameOf(""), "there");
  assert.equal(firstNameOf(null), "there");
  assert.equal(firstNameOf(undefined), "there");
  assert.equal(firstNameOf("   "), "there");
});

test("applyVars escapes HTML", () => {
  const out = applyVars("Hello {{name}}", { name: "<script>alert(1)</script>" });
  assert.ok(!out.includes("<script>"));
  assert.ok(out.includes("&lt;script&gt;"));
  assert.equal(applyVars("{{a}} & {{b}}", { a: "AT&T", b: "x" }), "AT&amp;T & x");
});

test("applyVars replaces missing vars with empty", () => {
  assert.equal(applyVars("Hi {{missing}}", {}), "Hi ");
});

test("applyVars handles multiple vars", () => {
  assert.equal(applyVars("{{greeting}} {{name}}", { greeting: "Hi", name: "Bob" }), "Hi Bob");
});
