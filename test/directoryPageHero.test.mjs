import test from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_PAGES } from "../src/lib/defaultPages.ts";
import { normalizeBlocks } from "../src/lib/pageBlocks.ts";
import { directoryPageBlocks, upgradeDirectoryBlocks } from "../src/lib/directoryPageBlocks.ts";

const identity = (value) => value;

test("tools directory has independent editable hero, listings and categories sections", () => {
  const page = BUILT_IN_PAGES.find((entry) => entry.path === "/tools");
  assert.deepEqual(page.blocks.map((block) => block.type), ["pageHeader", "row", "directoryResults", "row"]);
  const [hero, categories] = [page.blocks[1], page.blocks[3]];
  assert.equal(hero.props.columns, "1");
  assert.deepEqual(hero.props.items[0].map((block) => block.type), ["heading", "heading", "richText", "directorySearch", "richText", "directoryLogos"]);
  assert.equal(hero.props.items[0][0].props.level, "h1");
  assert.equal(hero.props.items[0][1].props.level, "h2");
  assert.deepEqual(categories.props.items[0].map((block) => block.type), ["heading", "directoryCategories"]);
  assert.deepEqual(normalizeBlocks(page.blocks, identity, { allowBuiltIn: true }).map((block) => block.type), page.blocks.map((block) => block.type));
});

test("an old directory marker becomes editable sections without losing saved copy or other sections", () => {
  const before = [
    { id: "tools-header", type: "pageHeader", props: { heading: "Custom title" } },
    { id: "tools-directory", type: "builtIn", props: {
      eyebrow: "Software & tools", eyebrowTag: "h1",
      heading: "Find your tool", headingTag: "h2", text: "Browse helpful tools",
      searchPlaceholder: "Find software", submitLabel: "Add a tool",
      listingNote: "Reviewed listings cost the current fee", categoriesHeading: "Browse categories",
    } },
  ];
  const after = upgradeDirectoryBlocks(before);
  assert.deepEqual(after.map((block) => block.type), ["pageHeader", "row", "directoryResults", "row"]);
  assert.equal(after[0], before[0]);
  assert.equal(after[1].props.items[0][0].props.text, "Software & tools");
  assert.equal(after[1].props.items[0][1].props.level, "h2");
  assert.equal(after[1].props.items[0][3].props.placeholder, "Find software");
  assert.equal(after[3].props.items[0][0].props.text, "Browse categories");
  assert.deepEqual(upgradeDirectoryBlocks(after), after);
});

test("existing directory sections gain spacing controls once and keep deliberate mobile resets", () => {
  const old = directoryPageBlocks();
  delete old[0].props.sideGap;
  delete old[0].props.mobile;
  delete old[0].props.items[0][1].props.lineHeight;
  delete old[0].props.items[0][1].props.mobile;
  const upgraded = upgradeDirectoryBlocks(old);
  assert.equal(upgraded[0].props.sideGap, 24);
  assert.equal(upgraded[0].props.mobile.sideGap, 16);
  assert.equal(upgraded[0].props.items[0][1].props.lineHeight, 105);
  assert.equal(upgraded[0].props.items[0][1].props.mobile.fontSize, 48);
  delete upgraded[0].props.mobile;
  delete upgraded[0].props.items[0][1].props.mobile;
  const reset = upgradeDirectoryBlocks(upgraded);
  assert.equal(reset[0].props.mobile, undefined);
  assert.equal(reset[0].props.items[0][1].props.mobile, undefined);
});
