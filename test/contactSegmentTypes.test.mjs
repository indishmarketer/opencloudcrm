import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSegmentRules,
  isValidSegmentRule,
  validateSegmentRules,
} from "../src/lib/contactSegmentTypes.ts";

test("parseSegmentRules returns empty for null/invalid", () => {
  assert.deepEqual(parseSegmentRules(null), { match: "all", rules: [] });
  assert.deepEqual(parseSegmentRules({}), { match: "all", rules: [] });
  assert.deepEqual(parseSegmentRules({ match: "any", rules: "not-array" }), { match: "any", rules: [] });
});

test("parseSegmentRules filters unsupported fields and caps at 20", () => {
  const rules = Array.from({ length: 25 }, () => ({ field: "marketing_status", operator: "equals", value: "subscribed" }));
  const parsed = parseSegmentRules({ match: "all", rules: [...rules, { field: "unknown_field", operator: "equals", value: "x" }] });
  assert.equal(parsed.rules.length, 20);
  assert.ok(parsed.rules.every((r) => r.field === "marketing_status"));
});

test("isValidSegmentRule validates marketing_status", () => {
  assert.equal(isValidSegmentRule({ field: "marketing_status", operator: "equals", value: "subscribed" }), true);
  assert.equal(isValidSegmentRule({ field: "marketing_status", operator: "equals", value: "bogus" }), false);
  assert.equal(isValidSegmentRule({ field: "marketing_status", operator: "within", value: "subscribed" }), false);
});

test("isValidSegmentRule validates boolean fields", () => {
  for (const field of ["has_account", "has_purchase", "community_member", "tool_submitter", "never_engaged"]) {
    assert.equal(isValidSegmentRule({ field, operator: "equals", value: "true" }), true);
    assert.equal(isValidSegmentRule({ field, operator: "equals", value: "false" }), true);
    assert.equal(isValidSegmentRule({ field, operator: "equals", value: "yes" }), false);
  }
});

test("isValidSegmentRule validates course and campaign ids", () => {
  assert.equal(isValidSegmentRule({ field: "course_enrolled", operator: "equals", value: "123" }), true);
  assert.equal(isValidSegmentRule({ field: "course_enrolled", operator: "equals", value: "0" }), false);
  assert.equal(isValidSegmentRule({ field: "course_enrolled", operator: "equals", value: "-5" }), false);
  assert.equal(isValidSegmentRule({ field: "course_enrolled", operator: "equals", value: "abc" }), false);
  assert.equal(isValidSegmentRule({ field: "campaign_opened", operator: "equals", value: "1" }), true);
  assert.equal(isValidSegmentRule({ field: "course_tier", operator: "equals", value: "5:free" }), true);
  assert.equal(isValidSegmentRule({ field: "course_tier", operator: "equals", value: "5:pro" }), true);
  assert.equal(isValidSegmentRule({ field: "course_tier", operator: "equals", value: "5:invalid" }), false);
  assert.equal(isValidSegmentRule({ field: "course_tier", operator: "equals", value: "5:free:extra" }), false);
});

test("isValidSegmentRule validates last_engaged_days", () => {
  assert.equal(isValidSegmentRule({ field: "last_engaged_days", operator: "within", value: "30" }), true);
  assert.equal(isValidSegmentRule({ field: "last_engaged_days", operator: "within", value: "0" }), true);
  assert.equal(isValidSegmentRule({ field: "last_engaged_days", operator: "within", value: "3650" }), true);
  assert.equal(isValidSegmentRule({ field: "last_engaged_days", operator: "within", value: "3651" }), false);
  assert.equal(isValidSegmentRule({ field: "last_engaged_days", operator: "equals", value: "30" }), false);
});

test("validateSegmentRules returns error for empty or invalid", () => {
  assert.equal(validateSegmentRules({ match: "all", rules: [] }).error, "Add at least one rule.");
  assert.equal(validateSegmentRules({ match: "all", rules: [{ field: "unknown", operator: "equals", value: "x" }] }).error, "Add at least one rule.");
  const invalid = validateSegmentRules({ match: "all", rules: [{ field: "marketing_status", operator: "equals", value: "bogus" }] });
  assert.ok(invalid.error);
  const valid = validateSegmentRules({ match: "all", rules: [{ field: "marketing_status", operator: "equals", value: "subscribed" }] });
  assert.equal(valid.error, undefined);
  assert.equal(valid.rules.rules.length, 1);
});

test("validateSegmentRules caps and rejects oversized", () => {
  const many = Array.from({ length: 21 }, () => ({ field: "marketing_status", operator: "equals", value: "subscribed" }));
  const result = validateSegmentRules({ match: "all", rules: many });
  assert.ok(result.error);
});
