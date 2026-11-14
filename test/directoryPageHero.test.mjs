import test from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_PAGES } from "../src/lib/defaultPages.ts";
import { normalizeBlocks } from "../src/lib/pageBlocks.ts";
import { directoryHeroFromBlocks, directoryHeroText, directoryListingNote } from "../src/lib/directoryPageHero.ts";

const identity = (value) => value;

test("the tools page keeps its removable title section and live content marker", () => {
  const page = BUILT_IN_PAGES.find((entry) => entry.path === "/tools");
  assert.deepEqual(page.blocks.map((block) => block.type), ["pageHeader", "builtIn"]);
});

test("directory hero copy and heading tags survive a page save", () => {
  const blocks = normalizeBlocks([{ id: "tools-directory", type: "builtIn", props: {
    eyebrow: "Tools & Software Directory", eyebrowTag: "h1",
    heading: "Find the tool that does the job", headingTag: "h2",
    text: "Browse {{count}} tools", searchPlaceholder: "Find software", submitLabel: "Add a tool",
    listingNote: "Reviewed listings cost {{price}}", categoriesHeading: "Browse categories",
  } }], identity, { allowBuiltIn: true });
  assert.deepEqual(directoryHeroFromBlocks(blocks), {
    eyebrow: "Tools & Software Directory", eyebrowTag: "h1",
    heading: "Find the tool that does the job", headingTag: "h2",
    text: "Browse {{count}} tools", searchPlaceholder: "Find software", submitLabel: "Add a tool",
    listingNote: "Reviewed listings cost {{price}}", categoriesHeading: "Browse categories",
  });
  assert.equal(directoryHeroText(directoryHeroFromBlocks(blocks).text, 90), "Browse 90 tools");
  assert.equal(directoryListingNote(directoryHeroFromBlocks(blocks).listingNote, "$5"), "Reviewed listings cost $5");
});
