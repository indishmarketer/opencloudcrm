import test from "node:test";
import assert from "node:assert/strict";
import {
  getCountryPhoneSpec,
  normalizeNationalDigits,
  validatePhoneNumber,
} from "../src/lib/phoneValidation.ts";

test("phone validation follows the selected country's numbering plan", () => {
  const cases = [
    ["IN", "9876543210", "+919876543210"],
    ["US", "2025550123", "+12025550123"],
    ["GB", "7400123456", "+447400123456"],
    ["BD", "1712345678", "+8801712345678"],
  ];

  for (const [country, national, e164] of cases) {
    const result = validatePhoneNumber(country, national, false);
    assert.equal(result.isValid, true, `${country} example should be valid`);
    assert.equal(result.e164, e164);
  }
});

test("an optional phone can be blank but an invalid entered number is rejected", () => {
  assert.equal(validatePhoneNumber("IN", "", true).isValid, true);
  assert.equal(validatePhoneNumber("IN", "98765", true).isValid, false);
  assert.equal(validatePhoneNumber("GB", "9876543210", true).isValid, false);
});

test("country metadata controls calling code, placeholder, and national digits", () => {
  const bangladesh = getCountryPhoneSpec("BD");
  assert.equal(bangladesh.dialCode, "880");
  assert.match(bangladesh.placeholder, /\d/);
  assert.equal(normalizeNationalDigits("BD", "+880 1712-345678"), "1712345678");
});

test("a national number requires a selected country", () => {
  const result = validatePhoneNumber("9876543210", null, false);
  assert.equal(result.isValid, false);
  assert.equal(result.error, "Select your country first.");
});
