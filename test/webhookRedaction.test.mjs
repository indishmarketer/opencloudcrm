import test from "node:test";
import assert from "node:assert/strict";
import { redactSensitiveKeys, buildEventEnvelope } from "../src/lib/webhookRedaction.ts";

test("redactSensitiveKeys strips password/token/secret/hash-like keys recursively", () => {
  const input = {
    email: "person@example.com",
    password: "hunter2",
    session_token: "abc123",
    api_key: "sk-live-xxx",
    nested: { password_hash: "$2b$...", ok: "fine" },
    list: [{ signing_secret: "s3cr3t" }, { name: "ok" }],
  };
  const redacted = redactSensitiveKeys(input);
  assert.equal(redacted.email, "person@example.com");
  assert.equal(redacted.password, "[redacted]");
  assert.equal(redacted.session_token, "[redacted]");
  assert.equal(redacted.api_key, "[redacted]");
  assert.equal(redacted.nested.password_hash, "[redacted]");
  assert.equal(redacted.nested.ok, "fine");
  assert.equal(redacted.list[0].signing_secret, "[redacted]");
  assert.equal(redacted.list[1].name, "ok");
});

test("redactSensitiveKeys leaves primitives and non-sensitive keys untouched", () => {
  assert.equal(redactSensitiveKeys("plain string"), "plain string");
  assert.equal(redactSensitiveKeys(42), 42);
  assert.equal(redactSensitiveKeys(null), null);
  assert.deepEqual(redactSensitiveKeys({ a: 1, b: "two" }), { a: 1, b: "two" });
});

test("buildEventEnvelope produces the documented schema shape", () => {
  const occurredAt = new Date("2026-08-28T12:00:00.000Z");
  const envelope = buildEventEnvelope({
    eventId: "11111111-1111-1111-1111-111111111111",
    eventType: "course.enrolled",
    occurredAt,
    source: "course_enrollments",
    contactId: 42,
    data: { course_id: 7, password: "should-not-appear" },
  });
  assert.equal(envelope.schema_version, 1);
  assert.equal(envelope.event_id, "11111111-1111-1111-1111-111111111111");
  assert.equal(envelope.event_type, "course.enrolled");
  assert.equal(envelope.occurred_at, "2026-08-28T12:00:00.000Z");
  assert.equal(envelope.source, "course_enrollments");
  assert.equal(envelope.contact_id, 42);
  assert.equal(envelope.data.course_id, 7);
  assert.equal(envelope.data.password, "[redacted]");
});

test("buildEventEnvelope allows a null contact_id when no identity is known", () => {
  const envelope = buildEventEnvelope({
    eventId: "id",
    eventType: "contact_form.submitted",
    occurredAt: new Date(),
    source: "contact_submissions",
    contactId: null,
    data: {},
  });
  assert.equal(envelope.contact_id, null);
});
