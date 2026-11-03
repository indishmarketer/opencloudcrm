import test from "node:test";
import assert from "node:assert/strict";
import { normalizeContactEmail } from "../src/lib/contacts.ts";

test("normalizeContactEmail trims and lowercases", () => {
  assert.equal(normalizeContactEmail("  Test@Example.COM  "), "test@example.com");
  assert.equal(normalizeContactEmail("ALREADY@lower.com"), "already@lower.com");
  assert.equal(normalizeContactEmail("a@b.c"), "a@b.c");
});

test("normalizeContactEmail handles empty", () => {
  assert.equal(normalizeContactEmail(""), "");
  assert.equal(normalizeContactEmail("   "), "");
});
