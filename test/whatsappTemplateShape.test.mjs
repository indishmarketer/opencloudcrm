import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSendComponents,
  dynamicUrlButtonIndex,
  templateButtons,
  validateTemplateButtons,
  validateTemplateDraft,
} from "../src/lib/whatsappTemplateShape.ts";

const draft = (over = {}) => ({
  name: "booking_reminder",
  body: "Hi {{1}}, your call is confirmed.",
  samples: ["Shubho"],
  ...over,
});

test("validateTemplateDraft accepts a well-formed draft", () => {
  assert.equal(validateTemplateDraft(draft()), null);
});

test("validateTemplateDraft enforces Meta's body rules", () => {
  assert.match(validateTemplateDraft(draft({ name: "Booking Reminder" })), /lowercase/);
  assert.match(validateTemplateDraft(draft({ body: "{{1}} your call is confirmed." })), /cannot start/);
  assert.match(validateTemplateDraft(draft({ body: "Your call is confirmed {{1}}" })), /cannot end/);
  assert.match(
    validateTemplateDraft(draft({ body: "Hi {{2}}, confirmed.", samples: ["a"] })),
    /numbered in order/,
  );
  assert.match(validateTemplateDraft(draft({ samples: [" "] })), /example value/);
});

test("validateTemplateButtons allows the combinations Meta allows", () => {
  assert.equal(validateTemplateButtons(), null);
  assert.equal(
    validateTemplateButtons([
      { type: "QUICK_REPLY", text: "Unsubscribe" },
      { type: "QUICK_REPLY", text: "Tell me more" },
      { type: "URL", text: "Open", url: "https://example.com/x" },
      { type: "PHONE_NUMBER", text: "Call", phone_number: "919876543210" },
    ]),
    null,
  );
});

test("validateTemplateButtons rejects interleaved quick replies", () => {
  // Meta refuses this with a bare "invalid combination", so it has to be
  // caught before the submit to be explainable.
  const problem = validateTemplateButtons([
    { type: "QUICK_REPLY", text: "Yes" },
    { type: "URL", text: "Open", url: "https://example.com" },
    { type: "QUICK_REPLY", text: "No" },
  ]);
  assert.match(problem, /grouped together/);
});

test("validateTemplateButtons enforces per-type limits and URL rules", () => {
  assert.match(
    validateTemplateButtons([
      { type: "URL", text: "A", url: "https://a.com" },
      { type: "URL", text: "B", url: "https://b.com" },
      { type: "URL", text: "C", url: "https://c.com" },
    ]),
    /two link buttons/,
  );
  assert.match(
    validateTemplateButtons([
      { type: "PHONE_NUMBER", text: "A", phone_number: "911111111111" },
      { type: "PHONE_NUMBER", text: "B", phone_number: "912222222222" },
    ]),
    /one call button/,
  );
  assert.match(validateTemplateButtons([{ type: "URL", text: "Go", url: "http://x.com" }]), /https/);
  assert.match(
    validateTemplateButtons([{ type: "URL", text: "Go", url: "https://x.com/{{1}}/more" }]),
    /very end/,
  );
  assert.match(
    validateTemplateButtons([{ type: "URL", text: "Go", url: "https://x.com/{{1}}" }]),
    /example of the finished URL/,
  );
  assert.equal(
    validateTemplateButtons([
      { type: "URL", text: "Go", url: "https://x.com/{{1}}", example: ["https://x.com/ai-agency"] },
    ]),
    null,
  );
  assert.match(validateTemplateButtons([{ type: "QUICK_REPLY", text: "" }]), /needs a label/);
});

test("dynamicUrlButtonIndex finds the button that needs a value at send time", () => {
  const template = {
    id: "1",
    name: "t",
    status: "APPROVED",
    category: "UTILITY",
    language: "en",
    components: [
      { type: "BODY", text: "Hi {{1}}, here is your course." },
      {
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: "Thanks" },
          { type: "URL", text: "Open", url: "https://www.indishmarketer.com/courses/{{1}}" },
        ],
      },
    ],
  };
  assert.equal(templateButtons(template).length, 2);
  // Index 1, not 0: Meta identifies the button by its position, and the
  // quick reply sits ahead of it.
  assert.equal(dynamicUrlButtonIndex(template), 1);
  assert.equal(
    dynamicUrlButtonIndex({ ...template, components: [{ type: "BODY", text: "No buttons here." }] }),
    null,
  );
});

test("buildSendComponents assembles header, body and button parts", () => {
  assert.equal(buildSendComponents({}), undefined);
  assert.deepEqual(buildSendComponents({ variables: ["Shubho", "tomorrow"] }), [
    { type: "body", parameters: [{ type: "text", text: "Shubho" }, { type: "text", text: "tomorrow" }] },
  ]);
  assert.deepEqual(
    buildSendComponents({
      media: { type: "image", link: "https://cdn.example.com/a.png" },
      variables: ["Shubho"],
      urlButton: { index: 1, value: "ai-agency" },
    }),
    [
      { type: "header", parameters: [{ type: "image", image: { link: "https://cdn.example.com/a.png" } }] },
      { type: "body", parameters: [{ type: "text", text: "Shubho" }] },
      { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: "ai-agency" }] },
    ],
  );
});
