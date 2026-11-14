import test from "node:test";
import assert from "node:assert/strict";
import { workflowTriggerOptions, VERIFIED_CONTACT_SOURCES, workflowReadinessIssues } from "../src/lib/workflowGraph.ts";
import { isValidWebhookEventType } from "../src/lib/webhookEventCatalogue.ts";

test("new site workflows offer only the requested high-level events", () => {
  assert.deepEqual(workflowTriggerOptions.map((option) => option.value), [
    "contact.verified", "newsletter.unsubscribed", "course.enrolled", "course.upgraded",
    "course.revoked", "course.completed", "course.inactivity", "payment.succeeded", "payment.failed", "contact.verification_requested",
  ]);
  assert.equal(workflowTriggerOptions[1].label, "Email unsubscribed");
  assert.equal(isValidWebhookEventType("contact.verification_requested"), false, "one-time credentials stay out of outbound webhooks");
  assert.equal(isValidWebhookEventType("contact_form.submitted"), true, "legacy webhook events remain valid");
});

test("verified contact source choices correspond to verified entry points", () => {
  assert.deepEqual(VERIFIED_CONTACT_SOURCES.map((source) => source.value), [
    "signup", "google", "linkedin", "github", "newsletter", "contact_form", "guide", "custom_form",
  ]);
});

test("verification requests require one direct transactional email to the requester", () => {
  const graph = {
    nodes: [
      { id: "trigger", data: { kind: "trigger", label: "Verification", config: { triggerKey: "contact.verification_requested" } } },
      { id: "email", data: { kind: "email", label: "Send code", config: { to: "{{contact.email}}", messageType: "transactional", subject: "Verify", body: "{{data.code}} {{data.verification_url}}" } } },
    ],
    edges: [{ id: "direct", source: "trigger", target: "email" }],
  };
  assert.deepEqual(workflowReadinessIssues(graph), []);
  graph.nodes[1].data.config.to = "elsewhere@example.com";
  assert.match(workflowReadinessIssues(graph).join(" "), /only to/);
  graph.nodes[1].data.config.to = "{{contact.email}}";
  graph.edges = [{ id: "other", source: "email", target: "trigger" }];
  assert.match(workflowReadinessIssues(graph).join(" "), /directly/);
});
