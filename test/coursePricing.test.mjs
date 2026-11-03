import test from "node:test";
import assert from "node:assert/strict";
import { convertCoursePrice, formatCoursePrice } from "../src/lib/currency.ts";

test("an INR price stays exact for Razorpay and converts for PayPal", () => {
  assert.deepEqual(convertCoursePrice(997, "INR", 88), { base: { amount: 997, currency: "INR" }, inr: 997, usd: 11 });
});

test("a USD price stays exact for PayPal and converts for Razorpay", () => {
  assert.deepEqual(convertCoursePrice(9, "USD", 88.4), { base: { amount: 9, currency: "USD" }, inr: 796, usd: 9 });
});

test("no price means a free course, and tiny prices never convert to zero", () => {
  assert.deepEqual(convertCoursePrice(null, "INR", 88), { base: null, inr: null, usd: null });
  assert.deepEqual(convertCoursePrice(0, "USD", 88), { base: null, inr: null, usd: null });
  assert.equal(convertCoursePrice(20, "INR", 88).usd, 1);
});

test("prices format with the right symbol", () => {
  assert.equal(formatCoursePrice(1999, "INR"), "₹1,999");
  assert.equal(formatCoursePrice(9, "USD"), "$9");
});
