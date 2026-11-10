import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFormDefinition,
  validateFormDefinition,
  normalizeFormFields,
  normalizeFormElements,
  elementsToFields,
  formDefinitionToElements,
  EMPTY_FORM_DESIGN,
} from "../src/lib/formsShape.ts";

test("form builder v2: blank form can start with 0 fields and no forced copy", () => {
  const normalized = normalizeFormDefinition({ name: "Minimal" });
  assert.equal(normalized.name, "Minimal");
  assert.equal(normalized.slug, "");
  assert.equal(normalized.heading, "");
  assert.equal(normalized.introText, "");
  assert.deepEqual(normalized.fields, []);
  assert.deepEqual(normalized.elements, []);
  assert.equal(normalized.submitLabel, "Submit");
  assert.equal(normalized.successHeading, "");
  assert.equal(normalized.successText, "");
  assert.equal(normalized.submissionAction, "message");
  assert.equal(normalized.redirectUrl, "");
  assert.equal(normalized.verifyEmail, false);
  assert.equal(normalized.isFixed, false);
  assert.deepEqual(normalized.design, EMPTY_FORM_DESIGN);

  // Blank form passes validation
  const error = validateFormDefinition(normalized);
  assert.equal(error, null);
});

test("form builder v2: slug normalizes to url-safe format", () => {
  const norm1 = normalizeFormDefinition({ name: "Contact Us", slug: "Contact Us 2026!" });
  assert.equal(norm1.slug, "contact-us-2026");

  const norm2 = normalizeFormDefinition({ name: "Test", slug: "---my-form---" });
  assert.equal(norm2.slug, "my-form");
});

test("form builder v2: supports hidden tracking fields with defaultValue", () => {
  const fields = normalizeFormFields([
    { label: "Your Name", type: "text", required: true },
    { key: "utm_source", label: "utm_source", type: "text", hidden: true, defaultValue: "google" },
  ]);

  assert.equal(fields.length, 2);
  assert.equal(fields[0].hidden, false);
  assert.equal(fields[1].hidden, true);
  assert.equal(fields[1].defaultValue, "google");
  assert.equal(fields[1].key, "utm_source");

  // A form with only hidden fields doesn't fail on missing visible label
  const form = normalizeFormDefinition({
    name: "Tracking Lead",
    fields: [{ key: "utm_campaign", label: "", type: "text", hidden: true, defaultValue: "summer_sale" }],
  });
  assert.equal(validateFormDefinition(form), null);
});

test("form builder v2: design system tokens are normalized and preserved", () => {
  const form = normalizeFormDefinition({
    name: "Styled Form",
    design: {
      buttonColor: "#10b981",
      buttonTextColor: "#ffffff",
      borderColor: "#d1d5db",
      backgroundColor: "#f9fafb",
      textColor: "#111827",
      borderRadius: "12px",
      fontFamily: "Inter, sans-serif",
    },
  });

  assert.equal(form.design.buttonColor, "#10b981");
  assert.equal(form.design.buttonTextColor, "#ffffff");
  assert.equal(form.design.borderRadius, "12px");
  assert.equal(form.design.fontFamily, "Inter, sans-serif");
});

test("form builder v2: email verification toggle requires an email field", () => {
  const noEmailForm = normalizeFormDefinition({
    name: "Survey",
    verifyEmail: true,
    fields: [{ label: "Your Note", type: "text", required: true }],
  });
  assert.equal(validateFormDefinition(noEmailForm), "Email verification requires an email field.");

  const withEmailForm = normalizeFormDefinition({
    name: "Survey",
    verifyEmail: true,
    fields: [
      { label: "Your Email", type: "email", required: true },
      { label: "Your Note", type: "text" },
    ],
  });
  assert.equal(validateFormDefinition(withEmailForm), null);
});

test("form builder v2: isFixed flag is preserved for auth forms", () => {
  const fixed = normalizeFormDefinition({ name: "Sign up / Log in", isFixed: true });
  assert.equal(fixed.isFixed, true);

  const regular = normalizeFormDefinition({ name: "Contact", isFixed: false });
  assert.equal(regular.isFixed, false);
});

test("form builder v2: canvas elements can be converted to/from fields cleanly", () => {
  const elements = [
    { id: "e1", type: "heading", headingText: "Get in touch" },
    { id: "e2", type: "text", textContent: "We reply within 24h" },
    { id: "e3", type: "text_input", fieldLabel: "Your Name", fieldKey: "name", fieldRequired: true },
    { id: "e4", type: "email", fieldLabel: "Work Email", fieldKey: "email", fieldRequired: true },
    { id: "e5", type: "hidden", fieldKey: "utm_source", fieldDefaultValue: "twitter" },
    { id: "e6", type: "button", buttonLabel: "Send Message" },
  ];

  const normalizedElements = normalizeFormElements(elements);
  assert.equal(normalizedElements.length, 6);

  const fields = elementsToFields(normalizedElements);
  assert.equal(fields.length, 3);
  assert.equal(fields[0].key, "name");
  assert.equal(fields[0].type, "text");
  assert.equal(fields[0].required, true);
  assert.equal(fields[1].key, "email");
  assert.equal(fields[1].type, "email");
  assert.equal(fields[2].key, "utm_source");
  assert.equal(fields[2].hidden, true);
  assert.equal(fields[2].defaultValue, "twitter");

  // Converting classic form definition to elements
  const converted = formDefinitionToElements({
    heading: "Contact Form",
    introText: "Drop us a line",
    fields: [{ key: "subject", label: "Subject", type: "text", required: true, hidden: false, defaultValue: "", options: "" }],
    submitLabel: "Submit Ticket",
  });
  assert.equal(converted.length, 4);
  assert.equal(converted[0].type, "heading");
  assert.equal(converted[1].type, "text");
  assert.equal(converted[2].type, "text_input");
  assert.equal(converted[3].type, "button");
});

test("form builder v2: submission action and redirect URL are normalized", () => {
  const redirectForm = normalizeFormDefinition({
    name: "Lead Form",
    submissionAction: "redirect",
    redirectUrl: "/thank-you-page",
  });
  assert.equal(redirectForm.submissionAction, "redirect");
  assert.equal(redirectForm.redirectUrl, "/thank-you-page");
});
