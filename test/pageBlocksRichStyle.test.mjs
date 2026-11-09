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
