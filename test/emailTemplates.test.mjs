import test from "node:test";
import assert from "node:assert/strict";
import { applyTemplateVars } from "../src/lib/emailTemplates.ts";

test("applyTemplateVars substitutes known vars", () => {
  assert.equal(applyTemplateVars("Hello {{name}}", { name: "Shubh" }), "Hello Shubh");
  assert.equal(applyTemplateVars("{{a}} and {{b}}", { a: "1", b: "2" }), "1 and 2");
});

test("applyTemplateVars replaces missing vars with empty string", () => {
  assert.equal(applyTemplateVars("Hi {{missing}}!", {}), "Hi !");
  assert.equal(applyTemplateVars("{{a}} {{b}}", { a: "x" }), "x ");
});

test("applyTemplateVars does not escape — caller must pre-escape", () => {
  // This is intentional: applyTemplateVars is raw, unlike emailAutomation's applyVars which escapes.
  // Fixed-email templates pass pre-escaped HTML fragments.
  const html = applyTemplateVars("Hello {{name}}", { name: "<b>evil</b>" });
  assert.equal(html, "Hello <b>evil</b>");
});

test("applyTemplateVars handles repeated and empty templates", () => {
  assert.equal(applyTemplateVars("", { x: "1" }), "");
  assert.equal(applyTemplateVars("no vars here", { x: "1" }), "no vars here");
  assert.equal(applyTemplateVars("{{x}} {{x}}", { x: "hi" }), "hi hi");
});

test("applyTemplateVars only matches word characters", () => {
  assert.equal(applyTemplateVars("{{var_with_underscore}}", { var_with_underscore: "ok" }), "ok");
  assert.equal(applyTemplateVars("{{kebab-case}}", { "kebab-case": "x" }), "{{kebab-case}}");
});
