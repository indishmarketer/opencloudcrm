import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyRazorpayCheckoutSignature, getRazorpayKeyId, notesValue } from "../src/lib/razorpay.ts";

test("checkout signature verifies only for the matching order, payment and secret", () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_example";
  process.env.RAZORPAY_KEY_SECRET = "test-secret";
  const sig = crypto.createHmac("sha256", "test-secret").update("order_ABC123|pay_XYZ789").digest("hex");
  assert.equal(verifyRazorpayCheckoutSignature("order_ABC123", "pay_XYZ789", sig), true);
  assert.equal(verifyRazorpayCheckoutSignature("order_ABC123", "pay_OTHER1", sig), false);
  assert.equal(verifyRazorpayCheckoutSignature("order_ABC123", "pay_XYZ789", "0".repeat(64)), false);
  assert.equal(verifyRazorpayCheckoutSignature("order_ABC123", "pay_XYZ789", ""), false);
});

test("razorpay is disabled unless both keys are set", () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_example";
  delete process.env.RAZORPAY_KEY_SECRET;
  assert.equal(getRazorpayKeyId(), null);
  process.env.RAZORPAY_KEY_SECRET = "test-secret";
  assert.equal(getRazorpayKeyId(), "rzp_test_example");
});

test("notes lookups ignore arrays and non-strings", () => {
  assert.equal(notesValue({ purchase_token: "t" }, "purchase_token"), "t");
  assert.equal(notesValue([], "purchase_token"), null);
  assert.equal(notesValue({ purchase_token: 5 }, "purchase_token"), null);
});
