import test from "node:test";
import assert from "node:assert/strict";
import {
  cssLength,
  normalizeFormDefinition,
  normalizeFormElements,
  elementsToFields,
  resolveContactMapping,
  FORM_ELEMENT_PALETTE,
  FORM_CONTACT_MAPPINGS,
} from "../src/lib/formsShape.ts";
import {
  elementButtonStyle,
  elementInputStyle,
  elementWrapperStyle,
  hasCustomWidth,
} from "../src/lib/formElementStyles.ts";
import { extractContactData } from "../src/lib/formsShape.ts";

const EMPTY_DESIGN = {
  buttonColor: "",
  buttonTextColor: "",
  borderColor: "",
  backgroundColor: "",
  textColor: "",
  borderRadius: "",
  fontFamily: "",
};

// ── Per-element layout and size ─────────────────────────────────────────────

test("cssLength accepts real lengths, reads bare numbers as px, rejects anything else", () => {
  assert.equal(cssLength("48"), "48px");
  assert.equal(cssLength(48), "48px");
  assert.equal(cssLength("50%"), "50%");
  assert.equal(cssLength("1.5rem"), "1.5rem");
  assert.equal(cssLength("auto"), "auto");
  assert.equal(cssLength("0"), "0");
  // Anything that is not a plain length is dropped, so a hand-typed or
  // MCP-supplied value can never smuggle extra CSS into an inline style.
  assert.equal(cssLength("48px; background: url(x)"), undefined);
  assert.equal(cssLength("calc(100% - 2px)"), undefined);
  assert.equal(cssLength(""), undefined);
  assert.equal(cssLength(undefined), undefined);
});

test("every element type carries the full layout bag, not just buttons", () => {
  const style = {
    width: "240",
    height: "56px",
    paddingX: "20",
    paddingY: "12",
    marginTop: "8",
    marginBottom: "24",
    fontSize: "18",
    fontWeight: "600",
    borderWidth: "2",
    borderRadius: "12px",
  };

  const input = elementInputStyle(EMPTY_DESIGN, style);
  assert.equal(input.width, "240px", "bare numbers become px");
  assert.equal(input.height, "56px");
  assert.equal(input.paddingLeft, "20px");
  assert.equal(input.paddingRight, "20px");
  assert.equal(input.paddingTop, "12px");
  assert.equal(input.paddingBottom, "12px");
  assert.equal(input.fontSize, "18px");
  assert.equal(input.fontWeight, "600");
  assert.equal(input.borderWidth, "2px");
  assert.equal(input.borderStyle, "solid");
  // A fixed height plus vertical padding has to be border-box or it overflows.
  assert.equal(input.boxSizing, "border-box");

  const button = elementButtonStyle(EMPTY_DESIGN, style);
  assert.equal(button.width, "240px");
  assert.equal(button.height, "56px");
  assert.equal(button.borderRadius, "12px");

  // Margins live on the wrapper so they push neighbours around.
  const wrapper = elementWrapperStyle(style);
  assert.equal(wrapper.marginTop, "8px");
  assert.equal(wrapper.marginBottom, "24px");
  assert.equal(input.marginTop, undefined);
});

test("legacy single-value padding still applies when paddingX/Y are unset", () => {
  const styles = elementInputStyle(EMPTY_DESIGN, { padding: "14px" });
  assert.equal(styles.paddingLeft, "14px");
  assert.equal(styles.paddingTop, "14px");
});

test("an element style overrides the form-wide design token", () => {
  const design = { ...EMPTY_DESIGN, buttonColor: "#111111", borderRadius: "4px" };
  const styles = elementButtonStyle(design, { backgroundColor: "#ff0000", borderRadius: "9999px" });
  assert.equal(styles.backgroundColor, "#ff0000");
  assert.equal(styles.borderRadius, "9999px");
  // And falls back to it when the element says nothing.
  assert.equal(elementButtonStyle(design, {}).backgroundColor, "#111111");
});

test("a custom width is what distinguishes a sized button from a full-width one", () => {
  assert.equal(hasCustomWidth({ width: "200px" }), true);
  assert.equal(hasCustomWidth({ width: "" }), false);
  assert.equal(hasCustomWidth(undefined), false);
});

test("element styles survive normalization, invalid lengths do not", () => {
  const [element] = normalizeFormElements([
    {
      id: "e1",
      type: "button",
      buttonLabel: "Go",
      elementStyle: {
        width: "180",
        height: "44px",
        paddingX: "nonsense",
        fontWeight: "700",
        backgroundColor: "#0ea5e9",
      },
    },
  ]);
  assert.equal(element.elementStyle.width, "180px");
  assert.equal(element.elementStyle.height, "44px");
  assert.equal(element.elementStyle.paddingX, undefined);
  assert.equal(element.elementStyle.fontWeight, "700");
  assert.equal(element.elementStyle.backgroundColor, "#0ea5e9");
});

test("date is a real element type, so a date field can be placed on a form", () => {
  assert.ok(FORM_ELEMENT_PALETTE.some((item) => item.type === "date"));
  const fields = elementsToFields(
    normalizeFormElements([{ id: "e1", type: "date", fieldKey: "starts_on", fieldLabel: "Starts on" }]),
  );
  assert.equal(fields.length, 1);
  assert.equal(fields[0].type, "date");
});

// ── Add to contact ──────────────────────────────────────────────────────────

test("an explicit contact mapping always wins over the type-derived default", () => {
  assert.equal(resolveContactMapping({ type: "email", contactMapping: "none" }), "none");
  assert.equal(resolveContactMapping({ type: "textarea", contactMapping: "detail" }), "detail");
  assert.equal(resolveContactMapping({ type: "text", contactMapping: "name" }), "name");
});

test("the legacy default no longer treats any text field as the contact's name", () => {
  // The old submit route matched `f.type === "text"`, so the first text field
  // on a form -- "Company", "Order ref" -- was written over the contact's
  // real name. Only a field that names itself a name does that now.
  assert.equal(resolveContactMapping({ type: "text", key: "company", label: "Company" }), "none");
  assert.equal(resolveContactMapping({ type: "text", key: "order_ref", label: "Order ref" }), "none");
  assert.equal(resolveContactMapping({ type: "text", key: "name", label: "Name" }), "name");
  assert.equal(resolveContactMapping({ type: "text", key: "full_name", label: "Full name" }), "name");
  // Typed fields keep mapping themselves.
  assert.equal(resolveContactMapping({ type: "email", key: "email", label: "Email" }), "email");
  assert.equal(resolveContactMapping({ type: "phone", key: "phone", label: "Phone" }), "phone");
  assert.equal(resolveContactMapping({ type: "country", key: "country", label: "Country" }), "country");
});

test("contact mapping round-trips from canvas element to derived field", () => {
  const elements = normalizeFormElements([
    { id: "e1", type: "email", fieldKey: "email", fieldLabel: "Email" },
    { id: "e2", type: "textarea", fieldKey: "brief", fieldLabel: "Brief", contactMapping: "detail", contactDetailLabel: "Project brief" },
    { id: "e3", type: "number", fieldKey: "headcount", fieldLabel: "Headcount", contactMapping: "none" },
  ]);
  const fields = elementsToFields(elements);
  assert.equal(fields[1].contactMapping, "detail");
  assert.equal(fields[1].contactDetailLabel, "Project brief");
  assert.equal(fields[2].contactMapping, "none");

  // And through a full definition normalize, which is what the API saves.
  const normalized = normalizeFormDefinition({ name: "Brief", elements });
  assert.equal(normalized.fields[1].contactMapping, "detail");
  assert.equal(normalized.elements[1].contactDetailLabel, "Project brief");
});

test("an unknown contact mapping is discarded rather than persisted", () => {
  const [element] = normalizeFormElements([{ id: "e1", type: "text_input", contactMapping: "sql_injection" }]);
  assert.equal(element.contactMapping, undefined);
  assert.ok(FORM_CONTACT_MAPPINGS.every((option) => option.value !== "sql_injection"));
});

test("extractContactData routes answers to the right place on the contact", () => {
  const fields = [
    { key: "email", label: "Email", type: "email", options: "", required: true, hidden: false, defaultValue: "" },
    { key: "full_name", label: "Full name", type: "text", options: "", required: true, hidden: false, defaultValue: "" },
    { key: "phone", label: "Phone", type: "phone", options: "", required: false, hidden: false, defaultValue: "" },
    { key: "country", label: "Country", type: "country", options: "", required: false, hidden: false, defaultValue: "" },
    {
      key: "budget", label: "Budget", type: "text", options: "", required: false, hidden: false, defaultValue: "",
      contactMapping: "detail", contactDetailLabel: "Stated budget",
    },
    {
      key: "notes", label: "Notes", type: "textarea", options: "", required: false, hidden: false, defaultValue: "",
      contactMapping: "none",
    },
  ];
  const data = extractContactData(fields, {
    email: "  Dana@Example.com ",
    full_name: "Dana Roy",
    phone: "+91 98765 43210",
    country: "IN",
    budget: "50k",
    notes: "internal only",
  });

  assert.equal(data.email, "Dana@Example.com");
  assert.equal(data.name, "Dana Roy");
  assert.equal(data.phone, "+91 98765 43210");
  assert.equal(data.country, "IN");
  assert.deepEqual(data.details, [{ key: "budget", label: "Stated budget", value: "50k" }]);
});

test("extractContactData ignores blank answers and keeps the first of each kind", () => {
  const fields = [
    { key: "email", label: "Email", type: "email", options: "", required: true, hidden: false, defaultValue: "" },
    { key: "alt_email", label: "Backup email", type: "email", options: "", required: false, hidden: false, defaultValue: "" },
    { key: "name", label: "Name", type: "text", options: "", required: false, hidden: false, defaultValue: "" },
  ];
  const data = extractContactData(fields, { email: "first@example.com", alt_email: "second@example.com", name: "   " });
  assert.equal(data.email, "first@example.com");
  assert.equal(data.name, null, "a whitespace-only answer is not a name");
  assert.deepEqual(data.details, []);
});

// ── System forms are ordinary forms ─────────────────────────────────────────

test("email verification is a free choice on every form, not pinned by a system role", () => {
  assert.equal(normalizeFormDefinition({ name: "Newsletter", verifyEmail: false }).verifyEmail, false);
  assert.equal(normalizeFormDefinition({ name: "Newsletter", verifyEmail: true }).verifyEmail, true);
  // systemRole is never taken from client input -- it is a server-side label
  // for built-in behaviour, and no longer a lock on editing or deleting.
  assert.equal(normalizeFormDefinition({ name: "Spoof", systemRole: "newsletter" }).systemRole, null);
});
