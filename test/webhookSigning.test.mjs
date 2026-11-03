import test from "node:test";
import assert from "node:assert/strict";
import {
  signWebhookBody,
  verifyWebhookSignature,
  generateSigningSecret,
  maskSecret,
} from "../src/lib/webhookSigning.ts";

test("signWebhookBody is deterministic for the same inputs", () => {
  const a = signWebhookBody("secret", "1700000000", '{"a":1}');
  const b = signWebhookBody("secret", "1700000000", '{"a":1}');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("signWebhookBody changes with secret, timestamp, or body", () => {
  const base = signWebhookBody("secret", "1700000000", '{"a":1}');
  assert.notEqual(signWebhookBody("other-secret", "1700000000", '{"a":1}'), base);
  assert.notEqual(signWebhookBody("secret", "1700000001", '{"a":1}'), base);
  assert.notEqual(signWebhookBody("secret", "1700000000", '{"a":2}'), base);
});

test("verifyWebhookSignature accepts a genuine signature and rejects a tampered one", () => {
  const secret = "shared-secret";
  const timestamp = "1700000000";
  const body = '{"event_type":"course.enrolled"}';
  const signature = signWebhookBody(secret, timestamp, body);
  assert.equal(verifyWebhookSignature(secret, timestamp, body, signature), true);
  assert.equal(verifyWebhookSignature(secret, timestamp, body, signature.slice(0, -1) + "0"), false);
  assert.equal(verifyWebhookSignature(secret, timestamp, body + "x", signature), false);
  assert.equal(verifyWebhookSignature("wrong-secret", timestamp, body, signature), false);
});

test("verifyWebhookSignature rejects a signature of the wrong length without throwing", () => {
  assert.equal(verifyWebhookSignature("secret", "1700000000", "{}", "not-hex"), false);
  assert.equal(verifyWebhookSignature("secret", "1700000000", "{}", ""), false);
});

test("generateSigningSecret produces unique, sufficiently long random secrets", () => {
  const a = generateSigningSecret();
  const b = generateSigningSecret();
  assert.notEqual(a, b);
  assert.equal(a.length, 64);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("maskSecret only ever reveals the last 4 characters", () => {
  const masked = maskSecret("abcdefgh1234");
  assert.equal(masked.endsWith("1234"), true);
  assert.equal(masked.includes("abcdefgh"), false);
  assert.equal(maskSecret("ab"), "••••");
});
