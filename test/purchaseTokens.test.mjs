import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRazorpayPurchaseToken, verifyRazorpayPurchaseToken } from "../src/lib/razorpayPurchaseToken.ts";
import { createPaypalPurchaseToken, verifyPaypalPurchaseToken } from "../src/lib/paypalPurchaseToken.ts";

test("Razorpay token round-trips and verifies", async () => {
  process.env.SESSION_SECRET = "test-secret-for-tokens-1234567890";
  const token = await createRazorpayPurchaseToken({ userId: 42, courseId: 7, amountPaise: 99900, currency: "INR" });
  const parsed = await verifyRazorpayPurchaseToken(token);
  assert.deepEqual(parsed, { userId: 42, courseId: 7, amountPaise: 99900, currency: "INR" });
});

test("Razorpay token rejects tampered payload", async () => {
  process.env.SESSION_SECRET = "test-secret-for-tokens-1234567890";
  const token = await createRazorpayPurchaseToken({ userId: 1, courseId: 2, amountPaise: 1000, currency: "INR" });
  const [payload, sig] = token.split(".");
  const tamperedPayload = payload.slice(0, -2) + "ab";
  const tampered = `${tamperedPayload}.${sig}`;
  const result = await verifyRazorpayPurchaseToken(tampered);
  assert.equal(result, null);
});

test("Razorpay token rejects wrong secret", async () => {
  process.env.SESSION_SECRET = "secret-one-1234567890";
  const token = await createRazorpayPurchaseToken({ userId: 1, courseId: 2, amountPaise: 1000, currency: "INR" });
  process.env.SESSION_SECRET = "secret-two-1234567890";
  const result = await verifyRazorpayPurchaseToken(token);
  assert.equal(result, null);
});

test("Razorpay token rejects expired token", async () => {
  process.env.SESSION_SECRET = "test-secret-for-tokens-1234567890";
  // Create a token that is already expired by mocking Date.now
  const realNow = Date.now;
  Date.now = () => realNow() - 3 * 60 * 60 * 1000; // 3 hours ago, token expires in 2 hours
  const token = await createRazorpayPurchaseToken({ userId: 1, courseId: 2, amountPaise: 1000, currency: "INR" });
  Date.now = realNow;
  const result = await verifyRazorpayPurchaseToken(token);
  assert.equal(result, null);
});

test("PayPal token round-trips and verifies", () => {
  process.env.SESSION_SECRET = "test-secret-for-tokens-1234567890";
  const token = createPaypalPurchaseToken({ userId: 10, courseId: 20, amountCents: 1999, currency: "USD" });
  const parsed = verifyPaypalPurchaseToken(token);
  assert.deepEqual(parsed, { userId: 10, courseId: 20, amountCents: 1999, currency: "USD" });
});

test("PayPal token rejects invalid amount", () => {
  process.env.SESSION_SECRET = "test-secret-for-tokens-1234567890";
  const token = createPaypalPurchaseToken({ userId: 1, courseId: 1, amountCents: 100, currency: "USD" });
  // Tamper to make amount 0 or negative - should be rejected
  const [payload] = token.split(".");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  decoded.a = 0;
  const newPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");
  // Need to resign with correct secret to test validation logic, not signature
  const secret = process.env.SESSION_SECRET;
  const sig = crypto.createHmac("sha256", secret).update(newPayload).digest("base64url");
  const newToken = `${newPayload}.${sig}`;
  const result = verifyPaypalPurchaseToken(newToken);
  assert.equal(result, null);
});

test("Both token verifiers reject non-string and malformed", async () => {
  assert.equal(await verifyRazorpayPurchaseToken(null), null);
  assert.equal(await verifyRazorpayPurchaseToken("not.a.valid.token.with.extra"), null);
  assert.equal(await verifyRazorpayPurchaseToken(""), null);
  assert.equal(verifyPaypalPurchaseToken(undefined), null);
  assert.equal(verifyPaypalPurchaseToken("bad"), null);
});
