import {
  MOBILE_OVERRIDABLE_KEYS,
  mobileOverrideCss,
  normalizeMobileOverrides,
  propsForDevice,
} from "../src/lib/mobileOverrides.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { BLOCK_DEFS, createBlock, normalizeBlock, styleFields, RICH_STYLE_FIELDS } from "../src/lib/pageBlocks.ts";

const identity = (html) => html;

function realElements() {
  return BLOCK_DEFS.filter((d) => d.group === "element" && !d.deprecated && !d.internal);
}

test("the element library has at least 30 real, pickable elements", () => {
  const elements = realElements();
  assert.ok(elements.length >= 30, `expected >= 30 elements, got ${elements.length}: ${elements.map((d) => d.type).join(", ")}`);
});

test("a newly dropped form waits for a saved form and exposes no field editor", () => {
  const form = createBlock("form");
  const definition = BLOCK_DEFS.find((block) => block.type === "form");
  assert.equal(form.props.savedFormId, "");
  // A form block is the form and its styling, nothing else. It used to be
  // able to staple a business-details sidebar onto itself -- a second,
  // hardcoded layout nobody could edit, and redundant beside the
  // "contactDetails" block and a two-column Row.
  assert.deepEqual(definition.fields.map((field) => field.key), ["savedFormId", "formBackgroundColor", "formTextColor", "formFieldBorderColor", "formButtonColor", "formButtonTextColor"]);
  assert.equal("customFields" in form.props, false);
  assert.equal("showContactDetails" in form.props, false);
});

test("every real element type is either on the rich style model or has a documented reason not to be", () => {
  // spacer has no style fields at all by design (hasSectionFields excludes
  // it); custom keeps its own bespoke width/bare mechanism. Every other
  // element must be styleModel: "rich" -- an element silently left on the
  // old enum system would offer Style tab fields that don't do anything,
  // the exact bug class this rewrite exists to kill.
  const exempt = new Set(["spacer", "custom"]);
  for (const def of realElements()) {
    if (exempt.has(def.type)) continue;
    assert.equal(def.styleModel, "rich", `${def.type} should be styleModel: "rich"`);
  }
});

test("a rich element's own defaults are real numbers, never an enum string, for every numeric style field", () => {
  const numericKeys = RICH_STYLE_FIELDS.filter((f) => f.kind === "number").map((f) => f.key);
  for (const def of realElements()) {
    if (def.styleModel !== "rich") continue;
    const block = createBlock(def.type);
    for (const key of numericKeys) {
      assert.equal(typeof block.props[key], "number", `${def.type}.${key} should be a number, got ${JSON.stringify(block.props[key])}`);
    }
  }
});

test("normalizeBlock clamps a rich numeric style field and keeps a valid fallback for an out-of-range value", () => {
  const block = normalizeBlock({ type: "heading", props: { text: "Hi", fontSize: 99999 } }, identity);
  assert.equal(block.props.fontSize, 160); // clamped to RICH_STYLE_FIELDS' fontSize max
  const block2 = normalizeBlock({ type: "heading", props: { text: "Hi", fontSize: "not a number" } }, identity);
  assert.equal(typeof block2.props.fontSize, "number");
});

test("styleFields() for a rich element returns RICH_STYLE_FIELDS, not the legacy enum pair", () => {
  const heading = BLOCK_DEFS.find((d) => d.type === "heading");
  const fields = styleFields(heading);
  assert.deepEqual(fields.map((f) => f.key).sort(), [...RICH_STYLE_FIELDS].map((f) => f.key).sort());
  // The legacy enum-only fields (e.g. "background"/"spacing" presets) must
  // not leak into a rich element's Style tab.
  assert.ok(!fields.some((f) => f.key === "background" || f.key === "spacing"));
});

test("styleFields() for an untouched legacy block type (hero) still returns the old enum pair, unchanged", () => {
  const hero = BLOCK_DEFS.find((d) => d.type === "hero");
  const fields = styleFields(hero);
  assert.ok(fields.some((f) => f.key === "background"), "hero keeps its SECTION_FIELDS background preset");
  const fontSizeField = fields.find((f) => f.key === "fontSize");
  assert.equal(fontSizeField.kind, "select", "hero's fontSize is still the old enum select, not a rich number");
});

test("every new element type normalizes cleanly from a bare {type} with no props", () => {
  const newTypes = [
    "divider", "list", "testimonial", "rating", "alert", "blockquote", "table", "progress",
    "priceTable", "teamMember", "steps", "tabs", "map", "embed", "breadcrumbs", "audio", "logo",
  ];
  for (const type of newTypes) {
    const block = normalizeBlock({ type }, identity);
    assert.equal(block.type, type);
    assert.ok(block.id);
  }
});

test("only one block type is offered for Custom design (embed does not duplicate the old customCode confusion)", () => {
  const offered = BLOCK_DEFS.filter((d) => d.category === "Custom design" && !d.deprecated && !d.internal);
  assert.deepEqual(offered.map((d) => d.type), ["custom"]);
});

// ── Mobile overrides must stay in step with the style fields ───────────────
// MOBILE_OVERRIDABLE_KEYS is written out by hand rather than derived from
// RICH_STYLE_FIELDS, because pageBlocks imports mobileOverrides and reading
// that array across the cycle at module top level would see it undefined.
// This is the guard that makes the duplication safe.

test("every overridable style field is listed for mobile, and nothing else is", () => {
  const styleKeys = RICH_STYLE_FIELDS.map((f) => f.key).filter((k) => k !== "anchor").sort();
  assert.deepEqual(
    [...MOBILE_OVERRIDABLE_KEYS].sort(),
    styleKeys,
    "MOBILE_OVERRIDABLE_KEYS has drifted from RICH_STYLE_FIELDS",
  );
  // anchor identifies a section; it is not styling and must never be
  // device-specific, or a #link would break on one device only.
  assert.ok(!MOBILE_OVERRIDABLE_KEYS.includes("anchor"));
});

test("a mobile override layers over the desktop value without replacing it", () => {
  const props = { fontSize: 32, paddingY: 48, textAlign: "left", mobile: { fontSize: 20 } };
  assert.equal(propsForDevice(props, "desktop").fontSize, 32, "desktop is untouched by a mobile value");
  assert.equal(propsForDevice(props, "mobile").fontSize, 20, "mobile uses its own value");
  assert.equal(propsForDevice(props, "mobile").paddingY, 48, "and inherits everything it did not override");
});

test("content keys cannot ride in through the mobile bag", () => {
  // Two devices showing different copy is a content problem, not a layout
  // one -- only style keys are accepted.
  const cleaned = normalizeMobileOverrides({ fontSize: 18, text: "Different on phones", href: "/evil" });
  assert.deepEqual(cleaned, { fontSize: 18 });
});

test("a page with no overrides emits no mobile CSS at all", () => {
  assert.equal(mobileOverrideCss([{ id: "a", type: "heading", props: { fontSize: 32 } }]), "");
});

test("overrides become one scoped media-query rule per block, columns included", () => {
  const css = mobileOverrideCss([
    { id: "a", type: "heading", props: { mobile: { fontSize: 20 } } },
    { id: "r", type: "row", props: { items: [[{ id: "c", type: "heading", props: { mobile: { paddingY: 8 } } }]] } },
  ]);
  assert.match(css, /@media \(max-width:767px\)/);
  assert.match(css, /\.pm-a/);
  assert.match(css, /font-size:20px !important/);
  // paddingY lives directly on the block's own wrapper -- the plain self
  // selector -- unlike fontSize below.
  assert.match(css, /\.pm-c\{padding-top:8px !important;padding-bottom:8px !important\}/, "an element inside a column gets its rule too");
});

// ── Regression: the override must reach wherever the inline style actually
// is, not just the block's own wrapper element ─────────────────────────────
// richBoxStyle/richTextStyle (blockViews.tsx) don't put every inline style
// on the same element RichSection's mobileClass goes on -- text-level
// properties land two levels deeper, on whichever element actually holds
// the block's text. A plain `.pm-x{text-align:center!important}` rule can
// never beat that inline style: CSS inheritance only supplies a value for
// a property the descendant doesn't already declare itself, and the
// descendant's own (non-important) inline style is a direct declaration,
// not an inherited one -- `!important` on an ANCESTOR cannot out-rank it.
// This silently no-opped every mobile textAlign/fontSize/fontWeight/
// textColor override until fixed.
test("text-level overrides (textAlign, fontSize, fontWeight, textColor) reach descendants, not just the block's own wrapper", () => {
  const css = mobileOverrideCss([
    { id: "a", type: "richText", props: { mobile: { textAlign: "center", textColor: "#ffffff" } } },
  ]);
  assert.match(css, /\.pm-a,\.pm-a \*\{text-align:center !important;color:#ffffff !important\}/);
});

test("maxWidth and paddingX land on RichSection's one inner content div, not the outer wrapper", () => {
  const css = mobileOverrideCss([{ id: "a", type: "richText", props: { mobile: { maxWidth: 480, paddingX: 12 } } }]);
  assert.match(css, /\.pm-a>div\{max-width:480px !important;padding-left:12px !important;padding-right:12px !important\}/);
});

test("a textColor mobile override actually produces a declaration (it used to be silently dropped: no CSS_PROPERTY handler existed for it)", () => {
  const css = mobileOverrideCss([{ id: "a", type: "richText", props: { mobile: { textColor: "#111111" } } }]);
  assert.match(css, /color:#111111 !important/);
});
