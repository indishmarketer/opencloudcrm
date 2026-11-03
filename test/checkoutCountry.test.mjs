import test from "node:test";
import assert from "node:assert/strict";

const { normalizeCountry, countryOptions, isIndianTimeZone, COUNTRY_CODES, pickCheckoutMethod } = await import("../src/lib/countries.ts");

test("country codes are validated, Cloudflare's unknown and Tor codes rejected", () => {
  assert.equal(normalizeCountry("in"), "IN");
  assert.equal(normalizeCountry(" us "), "US");
  assert.equal(normalizeCountry("XX"), null);
  assert.equal(normalizeCountry("T1"), null);
  assert.equal(normalizeCountry("EU"), null);
  assert.equal(normalizeCountry(""), null);
  assert.equal(normalizeCountry(undefined), null);
  assert.equal(normalizeCountry("IND"), null);
});

test("the picker lists every country once, India first", () => {
  const options = countryOptions();
  assert.equal(options[0].value, "IN");
  assert.equal(options[0].label, "India");
  assert.equal(new Set(options.map((o) => o.value)).size, COUNTRY_CODES.length);
  assert.ok(options.some((o) => o.value === "US" && o.label === "United States"));
});

test("an Indian device clock counts as India", () => {
  assert.equal(isIndianTimeZone("Asia/Kolkata"), true);
  assert.equal(isIndianTimeZone("Asia/Calcutta"), true);
  assert.equal(isIndianTimeZone("America/New_York"), false);
  assert.equal(isIndianTimeZone(undefined), false);
});

test("India pays with Razorpay only, everyone else with PayPal only", () => {
  assert.equal(pickCheckoutMethod("IN", true, true), "razorpay");
  assert.equal(pickCheckoutMethod("US", true, true), "paypal");
  assert.equal(pickCheckoutMethod("GB", true, true), "paypal");
  // Unknown location: the default market.
  assert.equal(pickCheckoutMethod(null, true, true), "razorpay");
});

test("fallbacks when a provider is switched off", () => {
  // PayPal off: international buyers fall back to Razorpay (international cards).
  assert.equal(pickCheckoutMethod("US", true, false), "razorpay");
  // Razorpay off: India gets nothing rather than PayPal, which refuses Indian buyers.
  assert.equal(pickCheckoutMethod("IN", false, true), null);
  assert.equal(pickCheckoutMethod("US", false, false), null);
});
