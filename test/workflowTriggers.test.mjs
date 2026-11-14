import test from "node:test";
import assert from "node:assert/strict";
import { workflowTriggerOptions, VERIFIED_CONTACT_SOURCES } from "../src/lib/workflowGraph.ts";
import { isValidWebhookEventType } from "../src/lib/webhookEventCatalogue.ts";

test("new site workflows offer only the requested high-level events", () => {
  assert.deepEqual(workflowTriggerOptions.map((option) => option.value), [
    "contact.verified", "newsletter.unsubscribed", "course.enrolled", "course.upgraded",
    "course.revoked", "course.completed", "course.inactivity", "payment.succeeded", "payment.failed",
  ]);
  assert.equal(workflowTriggerOptions[1].label, "Email unsubscribed");
  assert.equal(isValidWebhookEventType("contact_form.submitted"), true, "legacy webhook events remain valid");
});

test("verified contact source choices correspond to verified entry points", () => {
  assert.deepEqual(VERIFIED_CONTACT_SOURCES.map((source) => source.value), [
    "signup", "google", "linkedin", "github", "newsletter", "contact_form", "guide", "custom_form",
  ]);
});
