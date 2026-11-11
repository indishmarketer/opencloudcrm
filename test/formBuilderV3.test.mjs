import test from "node:test";
import assert from "node:assert/strict";
import {
  cssLength,
  normalizeFormDefinition,
  normalizeFormElements,
  elementsToFields,
  resolveContactRouting,
  contactTargetFor,
  defaultAddToContact,
  FORM_ELEMENT_PALETTE,
  FORM_ELEMENT_TYPES,
  NON_PALETTE_ELEMENT_TYPES,
  CONTACT_TARGET_LABELS,
} from "../src/lib/formsShape.ts";
import {
  elementButtonStyle,
  elementInputStyle,
  elementWrapperStyle,
  hasCustomWidth,
  splitBoxStyle,
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

test("the contact destination follows the element type and is never a choice", () => {
  // The whole point: an Email element can only ever be the contact's email,
  // so there is nothing to pick -- only whether to copy it across.
  assert.equal(contactTargetFor("email"), "email");
  assert.equal(contactTargetFor("phone"), "phone");
  assert.equal(contactTargetFor("country"), "country");
  assert.equal(contactTargetFor("address"), "address");
  assert.equal(contactTargetFor("full_name"), "full_name");
  assert.equal(contactTargetFor("first_name"), "first_name");
  assert.equal(contactTargetFor("last_name"), "last_name");
  // Anything without a dedicated contact column becomes an extra detail.
  assert.equal(contactTargetFor("text_input"), "detail");
  assert.equal(contactTargetFor("textarea"), "detail");
  assert.equal(contactTargetFor("number"), "detail");
  assert.equal(contactTargetFor("select"), "detail");
  assert.equal(contactTargetFor("checkbox"), "detail");

  for (const target of Object.keys(CONTACT_TARGET_LABELS)) {
    assert.equal(typeof CONTACT_TARGET_LABELS[target], "string");
  }
});

test("identity fields are ticked by default, everything else is opt-in", () => {
  assert.equal(defaultAddToContact("email"), true);
  assert.equal(defaultAddToContact("phone"), true);
  assert.equal(defaultAddToContact("full_name"), true);
  assert.equal(defaultAddToContact("address"), true);
  assert.equal(defaultAddToContact("textarea"), false);
  assert.equal(defaultAddToContact("number"), false);
});

test("the tick overrides the default in both directions", () => {
  assert.equal(resolveContactRouting({ type: "email", addToContact: false }).enabled, false);
  assert.equal(resolveContactRouting({ type: "email", addToContact: false }).target, "email");
  assert.equal(resolveContactRouting({ type: "textarea", addToContact: true }).enabled, true);
  assert.equal(resolveContactRouting({ type: "textarea", addToContact: true }).target, "detail");
});

test("a form saved under the old dropdown keeps routing the same way", () => {
  // contactMapping is read on the way in so existing forms are unaffected.
  assert.deepEqual(resolveContactRouting({ type: "textarea", contactMapping: "none" }), {
    target: "detail",
    enabled: false,
  });
  assert.deepEqual(resolveContactRouting({ type: "text", contactMapping: "name" }), {
    target: "full_name",
    enabled: true,
  });
  assert.deepEqual(resolveContactRouting({ type: "textarea", contactMapping: "detail" }), {
    target: "detail",
    enabled: true,
  });
});

test("a plain text field never becomes the contact's name", () => {
  // The original submit route matched `f.type === "text"`, so the first text
  // field on any form -- "Company", "Order ref" -- was written over the
  // contact's real name. A text field is an extra detail now, and naming one
  // "Full name" does not change that: use the Full name element.
  for (const key of ["company", "order_ref", "name", "full_name"]) {
    assert.equal(contactTargetFor("text_input"), "detail", `text_input (${key}) must not become a name`);
  }
  assert.equal(resolveContactRouting({ type: "text_input" }).enabled, false);
});

test("the tick and its destination round-trip from canvas element to field", () => {
  const elements = normalizeFormElements([
    { id: "e1", type: "email", fieldKey: "email", fieldLabel: "Email" },
    { id: "e2", type: "textarea", fieldKey: "brief", fieldLabel: "Brief", addToContact: true, contactDetailLabel: "Project brief" },
    { id: "e3", type: "number", fieldKey: "headcount", fieldLabel: "Headcount" },
    { id: "e4", type: "first_name", fieldKey: "first_name", fieldLabel: "First name" },
  ]);
  const fields = elementsToFields(elements);

  assert.equal(fields[0].contactTarget, "email");
  assert.equal(fields[0].addToContact, true);
  assert.equal(fields[1].contactTarget, "detail");
  assert.equal(fields[1].addToContact, true);
  assert.equal(fields[1].contactDetailLabel, "Project brief");
  assert.equal(fields[2].addToContact, false, "a number is opt-in");
  assert.equal(fields[3].contactTarget, "first_name");
  assert.equal(fields[3].addToContact, true);

  // And through a full definition normalize, which is what the API saves.
  const normalized = normalizeFormDefinition({ name: "Brief", elements });
  assert.equal(normalized.fields[1].contactTarget, "detail");
  assert.equal(normalized.elements[1].contactDetailLabel, "Project brief");
});

test("a hidden tracker is never contact data, whatever its element type", () => {
  const fields = elementsToFields(
    normalizeFormElements([
      { id: "e1", type: "email", fieldKey: "utm_email", fieldHidden: true, fieldDefaultValue: "x@y.z" },
    ]),
  );
  assert.equal(fields[0].addToContact, false);
});

test("an unrecognised legacy mapping is discarded rather than trusted", () => {
  const [element] = normalizeFormElements([{ id: "e1", type: "text_input", contactMapping: "sql_injection" }]);
  assert.equal(element.addToContact, undefined);
  assert.equal(resolveContactRouting({ type: "text_input", addToContact: element.addToContact }).enabled, false);
});

test("Full name, First name and Last name are real, placeable elements", () => {
  for (const type of ["full_name", "first_name", "last_name"]) {
    assert.ok(
      FORM_ELEMENT_PALETTE.some((item) => item.type === type),
      `${type} must be in the palette`,
    );
  }
});

const field = (key, type, extra = {}) => ({
  key,
  label: key,
  type,
  options: "",
  required: false,
  hidden: false,
  defaultValue: "",
  ...extra,
});

test("extractContactData routes answers to the right place on the contact", () => {
  const fields = [
    field("email", "email", { addToContact: true, contactTarget: "email" }),
    field("full_name", "full_name", { addToContact: true, contactTarget: "full_name" }),
    field("phone", "phone", { addToContact: true, contactTarget: "phone" }),
    field("country", "country", { addToContact: true, contactTarget: "country" }),
    field("address", "address", { addToContact: true, contactTarget: "address" }),
    field("budget", "text", { addToContact: true, contactTarget: "detail", contactDetailLabel: "Stated budget" }),
    field("notes", "textarea", { addToContact: false, contactTarget: "detail" }),
  ];
  const data = extractContactData(fields, {
    email: "  Dana@Example.com ",
    full_name: "Dana Roy",
    phone: "+91 98765 43210",
    country: "IN",
    address: "12 Laitumkhrah Rd",
    budget: "50k",
    notes: "internal only",
  });

  assert.equal(data.email, "Dana@Example.com");
  assert.equal(data.name, "Dana Roy");
  assert.equal(data.phone, "+91 98765 43210");
  assert.equal(data.country, "IN");
  assert.equal(data.address, "12 Laitumkhrah Rd");
  // An unticked field stays in the submission and never reaches the contact.
  assert.deepEqual(data.details, [{ key: "budget", label: "Stated budget", value: "50k" }]);
});

test("a full name fills the two halves, and two halves fill the full name", () => {
  const fromFull = extractContactData(
    [field("full_name", "full_name", { addToContact: true, contactTarget: "full_name" })],
    { full_name: "Dana Roy" },
  );
  assert.equal(fromFull.firstName, "Dana");
  assert.equal(fromFull.lastName, "Roy");

  const fromParts = extractContactData(
    [
      field("first_name", "first_name", { addToContact: true, contactTarget: "first_name" }),
      field("last_name", "last_name", { addToContact: true, contactTarget: "last_name" }),
    ],
    { first_name: "Dana", last_name: "Roy" },
  );
  assert.equal(fromParts.name, "Dana Roy");

  // A single-word name leaves the surname empty rather than inventing one.
  const single = extractContactData(
    [field("full_name", "full_name", { addToContact: true, contactTarget: "full_name" })],
    { full_name: "Prince" },
  );
  assert.equal(single.firstName, "Prince");
  assert.equal(single.lastName, null);
});

test("extractContactData ignores blank answers and keeps the first of each kind", () => {
  const fields = [
    field("email", "email", { addToContact: true, contactTarget: "email" }),
    field("alt_email", "email", { addToContact: true, contactTarget: "email" }),
    field("full_name", "full_name", { addToContact: true, contactTarget: "full_name" }),
  ];
  const data = extractContactData(fields, {
    email: "first@example.com",
    alt_email: "second@example.com",
    full_name: "   ",
  });
  assert.equal(data.email, "first@example.com");
  assert.equal(data.name, null, "a whitespace-only answer is not a name");
  assert.deepEqual(data.details, []);
});

// ── System forms are ordinary forms ─────────────────────────────────────────

test("email verification is a free choice on every form", () => {
  assert.equal(normalizeFormDefinition({ name: "Newsletter", verifyEmail: false }).verifyEmail, false);
  assert.equal(normalizeFormDefinition({ name: "Newsletter", verifyEmail: true }).verifyEmail, true);
});

test("built-in behaviour is an owner setting, and only the two real values", () => {
  // Newsletter and Contact are ordinary forms that happen to carry an extra
  // action; any form can take it on, and either can drop it and become
  // completely ordinary.
  assert.equal(normalizeFormDefinition({ name: "F" }).systemRole, null);
  assert.equal(normalizeFormDefinition({ name: "F", systemRole: "newsletter" }).systemRole, "newsletter");
  assert.equal(normalizeFormDefinition({ name: "F", systemRole: "contact" }).systemRole, "contact");
  assert.equal(normalizeFormDefinition({ name: "F", systemRole: null }).systemRole, null);
  assert.equal(normalizeFormDefinition({ name: "F", systemRole: "admin" }).systemRole, null);
});

// ── The palette must stay in step with the element list ─────────────────────
// These exist because Full name, First name, Last name and Date were all
// added to the shared element list while the editor kept its own hardcoded
// copy of the palette -- so they were real everywhere except the one panel
// you would drag them from.

test("every element type is offered in the palette", () => {
  const offered = new Set(FORM_ELEMENT_PALETTE.map((item) => item.type));
  const missing = FORM_ELEMENT_TYPES.filter(
    (type) => !offered.has(type) && !NON_PALETTE_ELEMENT_TYPES.includes(type),
  );
  assert.deepEqual(missing, [], `element types missing from the palette: ${missing.join(", ")}`);
});

test("the palette offers nothing that is not a real element type", () => {
  const known = new Set(FORM_ELEMENT_TYPES);
  for (const item of FORM_ELEMENT_PALETTE) {
    assert.ok(known.has(item.type), `palette offers unknown type ${item.type}`);
    assert.ok(item.label, `palette entry ${item.type} needs a label`);
    assert.ok(["layout", "fields", "action"].includes(item.category), `${item.type} has no valid group`);
  }
});

test("the name elements sit before the generic text input in the palette", () => {
  const order = FORM_ELEMENT_PALETTE.filter((i) => i.category === "fields").map((i) => i.type);
  for (const name of ["full_name", "first_name", "last_name"]) {
    assert.ok(order.indexOf(name) > -1, `${name} must be a field`);
    assert.ok(
      order.indexOf(name) < order.indexOf("text_input"),
      `${name} should come before the generic text input`,
    );
  }
});

test("every palette field type survives a round-trip to a saved field", () => {
  // Catches an element that renders in the palette but normalizes away --
  // the other half of the same divergence.
  for (const item of FORM_ELEMENT_PALETTE) {
    if (item.category !== "fields") continue;
    const [element] = normalizeFormElements([{ id: "x", type: item.type, fieldKey: "k", fieldLabel: "L" }]);
    assert.equal(element.type, item.type, `${item.type} must not be rewritten on save`);
    assert.equal(elementsToFields([element]).length, 1, `${item.type} must produce a field`);
  }
});

// ── Alignment has to move the box, not only the label ───────────────────────
// text-align moves inline content; it never moves a block-level box. Once a
// field has an explicit width its input is a sized block, so "Center" moved
// the label and left the box on the left -- and the console canvas and the
// live page disagreed, because an unstyled <input> is inline-block (which
// text-align does move) while the live one was block.

test("a sized element is centred with auto margins, not text-align alone", () => {
  const centred = elementInputStyle(EMPTY_DESIGN, { width: "280px", textAlign: "center" });
  assert.equal(centred.width, "280px");
  assert.equal(centred.marginLeft, "auto");
  assert.equal(centred.marginRight, "auto");

  const right = elementInputStyle(EMPTY_DESIGN, { width: "280px", textAlign: "right" });
  assert.equal(right.marginLeft, "auto");
  assert.equal(right.marginRight, "0");

  const left = elementInputStyle(EMPTY_DESIGN, { width: "280px", textAlign: "left" });
  assert.equal(left.marginLeft, "0");
  assert.equal(left.marginRight, "auto");
});

test("a full-width element is not given margins -- it has nowhere to move", () => {
  const noWidth = elementInputStyle(EMPTY_DESIGN, { textAlign: "center" });
  assert.equal(noWidth.marginLeft, undefined);
  assert.equal(noWidth.marginRight, undefined);
  assert.equal(noWidth.textAlign, "center", "the label still aligns");
});

test("buttons are positioned the same way as inputs", () => {
  const button = elementButtonStyle(EMPTY_DESIGN, { width: "320px", textAlign: "center" });
  assert.equal(button.width, "320px");
  assert.equal(button.marginLeft, "auto");
  assert.equal(button.marginRight, "auto");
});

test("a composite control sizes the row, not each of its pieces", () => {
  // The phone field is a country button beside an input. Applying the whole
  // style to both made a 280px field render 560px wide.
  const full = elementInputStyle(EMPTY_DESIGN, {
    width: "280px",
    textAlign: "center",
    borderColor: "#ff0000",
    paddingX: "10",
  });
  const { box, paint } = splitBoxStyle(full);

  assert.equal(box.width, "280px");
  assert.equal(box.marginLeft, "auto");
  assert.equal(paint.width, undefined, "a piece must not carry the row's width");
  assert.equal(paint.marginLeft, undefined, "a piece must not carry the row's placement");
  assert.equal(paint.borderColor, "#ff0000", "but it keeps its own look");
  assert.equal(paint.paddingLeft, "10px");
});
