import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const signature = (secret, body) => crypto.createHmac("sha256", secret).update(body).digest("hex");

test("Cal.com webhook signatures cover the exact raw request body", async () => {
  const { verifyCalcomWebhookSignature } = await import("../src/lib/calcom.ts");
  const secret = "test-webhook-secret";
  const rawBody = '{"triggerEvent":"BOOKING_CREATED","payload":{"uid":"booking-1"}}';
  const valid = signature(secret, rawBody);

  assert.equal(verifyCalcomWebhookSignature(secret, rawBody, valid), true);
  assert.equal(verifyCalcomWebhookSignature(secret, `${rawBody} `, valid), false);
  assert.equal(verifyCalcomWebhookSignature("wrong-secret", rawBody, valid), false);
  assert.equal(verifyCalcomWebhookSignature(secret, rawBody, "not-a-signature"), false);
});

test("Cal.com booking uid extraction handles both field names", async () => {
  const { bookingUidFromCalcom } = await import("../src/lib/calcom.ts");
  assert.equal(bookingUidFromCalcom({ uid: "booking-1" }), "booking-1");
  assert.equal(bookingUidFromCalcom({ bookingUid: "booking-3" }), "booking-3");
});

test("calVideoUrl builds Cal Video's stable per-booking URL", async () => {
  const { calVideoUrl } = await import("../src/lib/calcom.ts");
  assert.equal(calVideoUrl("abc123"), "https://app.cal.com/video/abc123");
  // encodeURIComponent, not a raw string concat -- a uid should never be
  // trusted to be URL-safe as-is.
  assert.equal(calVideoUrl("a/b c"), "https://app.cal.com/video/a%2Fb%20c");
});
