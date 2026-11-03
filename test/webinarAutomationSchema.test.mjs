import test from "node:test";
import assert from "node:assert/strict";
import { webinarAutomationBodySchema, webinarAutomationPayload } from "../src/lib/webinarAutomationSchema.ts";

test("automation saves PostgreSQL bigint IDs returned as strings", () => {
  const result = webinarAutomationBodySchema.safeParse({
    schedules: [{ id: "12", schedule_kind: "weekly", timezone: "Asia/Kolkata", weekdays: [2], specific_date: null, local_time: "18:30", active: true }],
    events: [{ id: "34", event_type: "quiz", trigger_seconds: 60, title: "Quick question", body: null, options: ["One", "Two"], correct_option: 0, cta_label: null, cta_url: null, response_type: null, display_mode: "popup", active: true }],
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.schedules[0].id, 12);
    assert.equal(result.data.events[0].id, 34);
  }
});

test("automation payload never sends database-only schedule or interaction fields", () => {
  const payload = webinarAutomationPayload({
    schedules: [{ id: "12", webinar_id: 1, schedule_kind: "weekly", timezone: "Asia/Kolkata", weekdays: [2], specific_date: null, local_time: "18:30", active: true, created_at: "2026-08-30", updated_at: "2026-08-30" }],
    events: [{ id: "34", webinar_id: 1, event_type: "quiz", trigger_seconds: 60, title: "Quick question", body: null, options: ["One", "Two"], correct_option: 0, cta_label: null, cta_url: null, response_type: null, display_mode: "popup", active: true, created_at: "2026-08-30", updated_at: "2026-08-30" }],
  });
  assert.equal(webinarAutomationBodySchema.safeParse(payload).success, true);
  assert.deepEqual(Object.keys(payload.schedules[0]).sort(), ["active", "id", "local_time", "schedule_kind", "specific_date", "timezone", "weekdays"]);
  assert.deepEqual(Object.keys(payload.events[0]).sort(), ["active", "body", "correct_option", "cta_label", "cta_url", "display_mode", "event_type", "id", "options", "response_type", "title", "trigger_seconds"]);
});

test("question interaction requires a response_type, and choice mode requires at least two options", () => {
  const missingResponseType = webinarAutomationBodySchema.safeParse({
    schedules: [],
    events: [{ event_type: "question", trigger_seconds: 10, title: "Do you agree?", body: null, options: [], correct_option: null, cta_label: null, cta_url: null, response_type: null, display_mode: "qa", active: true }],
  });
  assert.equal(missingResponseType.success, false);

  const choiceTooFewOptions = webinarAutomationBodySchema.safeParse({
    schedules: [],
    events: [{ event_type: "question", trigger_seconds: 10, title: "Do you agree?", body: null, options: ["Yes"], correct_option: null, cta_label: null, cta_url: null, response_type: "choice", display_mode: "qa", active: true }],
  });
  assert.equal(choiceTooFewOptions.success, false);

  const validChoice = webinarAutomationBodySchema.safeParse({
    schedules: [],
    events: [{ event_type: "question", trigger_seconds: 10, title: "Do you agree?", body: null, options: ["Yes", "No"], correct_option: null, cta_label: null, cta_url: null, response_type: "choice", display_mode: "qa", active: true }],
  });
  assert.equal(validChoice.success, true);

  const validText = webinarAutomationBodySchema.safeParse({
    schedules: [],
    events: [{ event_type: "question", trigger_seconds: 10, title: "What's blocking you?", body: null, options: [], correct_option: null, cta_label: null, cta_url: null, response_type: "text", display_mode: "both", active: true }],
  });
  assert.equal(validText.success, true);
});
