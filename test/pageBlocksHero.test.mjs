import test from "node:test";
import assert from "node:assert/strict";
import { createInsertedBlock, convertBlockToElements, hasElementTemplate, normalizeBlock, createBlock } from "../src/lib/pageBlocks.ts";

const identity = (html) => html;

function flatten(row) {
  return row.props.items.flat();
}

test("hasElementTemplate is true only for types with a decomposed version", () => {
  assert.equal(hasElementTemplate("hero"), true);
  assert.equal(hasElementTemplate("richText"), false);
  assert.equal(hasElementTemplate("cards"), false);
});

test("createInsertedBlock('hero') builds a two-column row of real elements, not the atomic hero block", () => {
  const block = createInsertedBlock("hero");
  assert.equal(block.type, "row");
  assert.equal(block.props.columns, "2");
  assert.equal(block.props.items.length, 2);

  const left = block.props.items[0];
  // Default hero has no eyebrow, no body text, no secondary button -- only
  // the main heading and the primary button should be present.
  assert.equal(left.length, 2);
  assert.equal(left[0].type, "heading");
  assert.equal(left[0].props.text, "Your headline goes here");
  assert.equal(left[0].props.level, "h2");
  assert.equal(left[1].type, "button");
  assert.equal(left[1].props.label, "Get in touch");
  assert.equal(left[1].props.href, "/contact");

  // No image by default, so the right column is empty, not a blank image element.
  assert.deepEqual(block.props.items[1], []);
});

test("createInsertedBlock for a type with no template behaves exactly like createBlock", () => {
  const inserted = createInsertedBlock("richText");
  assert.equal(inserted.type, "richText");
  assert.equal(inserted.props.html, createBlock("richText").props.html);
});

test("convertBlockToElements seeds the decomposed tree from the existing atomic block's content", () => {
  const hero = createBlock("hero");
  hero.props.eyebrow = "New";
  hero.props.heading = "Ship faster";
  hero.props.text = "A real subheading.";
  hero.props.primaryLabel = "Start now";
  hero.props.primaryHref = "/start";
  hero.props.secondaryLabel = "Learn more";
  hero.props.secondaryHref = "/learn";
  hero.props.image = "https://example.com/hero.webp";
  hero.props.imageAlt = "A product screenshot";

  const converted = convertBlockToElements(hero);
  assert.ok(converted);
  assert.equal(converted.type, "row");

  const left = converted.props.items[0];
  assert.equal(left.length, 5, "eyebrow, heading, body text, primary + secondary buttons");
  assert.equal(left[0].type, "heading");
  assert.equal(left[0].props.text, "New");
  assert.equal(left[0].props.level, "h4");
  assert.equal(left[1].type, "heading");
  assert.equal(left[1].props.text, "Ship faster");
  assert.equal(left[2].type, "richText");
  assert.ok(left[2].props.html.includes("A real subheading."));
  assert.equal(left[3].type, "button");
  assert.equal(left[3].props.label, "Start now");
  assert.equal(left[3].props.style, "primary");
  assert.equal(left[4].type, "button");
  assert.equal(left[4].props.label, "Learn more");
  assert.equal(left[4].props.style, "outline");

  const right = converted.props.items[1];
  assert.equal(right.length, 1);
  assert.equal(right[0].type, "image");
  assert.equal(right[0].props.image, "https://example.com/hero.webp");
  assert.equal(right[0].props.alt, "A product screenshot");
});

test("convertBlockToElements escapes body text so it can't break out of the generated <p> markup", () => {
  const hero = createBlock("hero");
  hero.props.text = "<script>alert(1)</script> & \"quotes\"";
  const converted = convertBlockToElements(hero);
  const richText = flatten(converted).find((b) => b.type === "richText");
  assert.ok(richText);
  assert.ok(!richText.props.html.includes("<script>"));
  assert.match(richText.props.html, /^<p>.*<\/p>$/);
});

test("convertBlockToElements returns null for a type with no decomposed template", () => {
  assert.equal(convertBlockToElements(createBlock("richText")), null);
});

test("a decomposed hero survives normalizeBlock unchanged in shape -- every nested element is a valid nestable type", () => {
  const block = createInsertedBlock("hero");
  block.props.items[0] = [
    { id: "a", type: "heading", props: { text: "Hi" } },
    { id: "b", type: "button", props: { label: "Go", href: "/go" } },
  ];
  block.props.items[1] = [{ id: "c", type: "image", props: { image: "https://x.com/a.webp" } }];
  const normalized = normalizeBlock(block, identity);
  assert.equal(normalized.type, "row");
  const left = normalized.props.items[0];
  assert.equal(left.length, 2);
  assert.equal(left[0].type, "heading");
  assert.equal(left[0].props.text, "Hi");
  assert.equal(left[1].type, "button");
  assert.equal(left[1].props.label, "Go");
});
