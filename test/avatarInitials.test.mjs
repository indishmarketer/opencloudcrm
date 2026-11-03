import test from "node:test";
import assert from "node:assert/strict";

const { initialsOf } = await import("../src/lib/initials.ts");

test("takes first and last initials", () => {
  assert.equal(initialsOf("Rohit Sharma"), "RS");
  assert.equal(initialsOf("Ankit Tiwari"), "AT");
});

test("skips a middle name rather than letting it push out the surname", () => {
  assert.equal(initialsOf("Shubho Kumar Dey"), "SD");
});

test("falls back to one letter for a single word", () => {
  assert.equal(initialsOf("Prarthana"), "P");
});

test("handles missing, empty and whitespace-only names", () => {
  assert.equal(initialsOf(null), "?");
  assert.equal(initialsOf(undefined), "?");
  assert.equal(initialsOf(""), "?");
  assert.equal(initialsOf("   "), "?");
});

test("collapses extra spacing and uppercases", () => {
  assert.equal(initialsOf("  arun   mehta  "), "AM");
});
