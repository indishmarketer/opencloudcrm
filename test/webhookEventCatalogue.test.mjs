import test from "node:test";
import assert from "node:assert/strict";
import { WEBHOOK_EVENT_TYPES, isValidWebhookEventType } from "../src/lib/webhookEventCatalogue.ts";

test("every catalogue entry has a unique, dot-namespaced key", () => {
  const keys = WEBHOOK_EVENT_TYPES.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, "event type keys must be unique");
  for (const key of keys) {
    assert.match(key, /^[a-z_]+\.[a-z_]+$/, `${key} should look like source.action`);
  }
});

test("isValidWebhookEventType accepts every catalogue key and rejects unknown ones", () => {
  for (const evt of WEBHOOK_EVENT_TYPES) {
    assert.equal(isValidWebhookEventType(evt.key), true);
  }
  assert.equal(isValidWebhookEventType("made_up.event"), false);
  assert.equal(isValidWebhookEventType(""), false);
  assert.equal(isValidWebhookEventType("test.ping"), false); // reserved for console test sends, not a subscribable event
});
