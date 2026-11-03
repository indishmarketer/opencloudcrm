import test from "node:test";
import assert from "node:assert/strict";
import { scopeCss } from "../src/lib/scopedCss.ts";
import {
  BLOCK_DEFS,
  BlockValidationError,
  blockSummary,
  createBlock,
  describeBlockTypes,
  findPageLevelTags,
  normalizeBlock,
} from "../src/lib/pageBlocks.ts";

const identity = (html) => html;
const scope = "b_test1234";

test("scopeCss wraps plain rules so they can only match inside the section", () => {
  const out = scopeCss(".card { color: red }", scope);
  assert.match(out, /^#b_test1234 \{/);
  assert.ok(out.includes(".card { color: red }"));
});

test("scopeCss leaves an empty or whitespace-only stylesheet empty", () => {
  assert.equal(scopeCss("", scope), "");
  assert.equal(scopeCss("   \n\t ", scope), "");
});

test("scopeCss hoists @keyframes out of the wrapper, since nesting one is invalid", () => {
  const out = scopeCss(".x { animation: spin 1s } @keyframes spin { from { rotate: 0deg } to { rotate: 360deg } }", scope);
  const wrapperStart = out.indexOf("#b_test1234 {");
  const keyframesStart = out.indexOf("@keyframes spin");
  assert.ok(keyframesStart !== -1, "keyframes kept");
  assert.ok(keyframesStart < wrapperStart, "keyframes emitted before the scoping wrapper, not inside it");
  assert.ok(out.includes("animation: spin 1s"));
});

test("scopeCss hoists @font-face too, and keeps the rest scoped", () => {
  const out = scopeCss('@font-face { font-family: "X"; src: url(/x.woff2) } p { margin: 0 }', scope);
  assert.ok(out.startsWith("@font-face"));
  assert.ok(out.includes("#b_test1234 {"));
  assert.ok(out.indexOf("p { margin: 0 }") > out.indexOf("#b_test1234 {"));
});

test("scopeCss keeps @media inside the wrapper, where nesting handles it", () => {
  const out = scopeCss("@media (min-width: 768px) { .grid { display: grid } }", scope);
  assert.ok(out.startsWith("#b_test1234 {"));
  assert.ok(out.includes("@media (min-width: 768px)"));
});

test("scopeCss rewrites :root/html/body to the section itself", () => {
  const out = scopeCss(":root { --gap: 2rem }\nbody { margin: 0 }", scope);
  assert.ok(!out.includes(":root"), "no :root left to be a no-op inside the section");
  assert.ok(!/(^|[\s,{}])body(?=[\s,{])/.test(out), "no bare body selector left");
  assert.ok(out.includes("--gap: 2rem"));
});

test("scopeCss is not fooled by braces inside strings or comments", () => {
  const out = scopeCss('.a::after { content: "}" } /* @keyframes fake { } */ .b { color: red }', scope);
  // Both real rules survive, and the commented-out @keyframes was not
  // hoisted out as if it were a real one.
  assert.ok(out.includes(".a::after"));
  assert.ok(out.includes(".b { color: red }"));
  assert.ok(!out.startsWith("/*"), "the comment was not treated as a top-level at-rule");
});

test("every hoisted @import stays a statement at-rule (terminated by ; not })", () => {
  const out = scopeCss('@import url("/a.css");\n.x { color: red }', scope);
  assert.ok(out.startsWith('@import url("/a.css");'));
  assert.ok(out.includes("#b_test1234 {"));
  assert.ok(out.includes(".x { color: red }"));
});

test("the custom block exists and carries html, css and js fields", () => {
  const def = BLOCK_DEFS.find((d) => d.type === "custom");
  assert.ok(def, "custom block registered");
  const keys = def.fields.map((f) => f.key);
  assert.deepEqual(keys, ["html", "css", "js", "width", "bare"]);
  assert.ok(!def.deprecated && !def.internal);
  // It is a whole section, never an element inside a row's column.
  assert.ok(!def.nestable);
});

test("the custom block's code fields take far more than the embed-snippet limit", () => {
  const def = BLOCK_DEFS.find((d) => d.type === "custom");
  const limits = Object.fromEntries(def.fields.filter((f) => f.kind === "code").map((f) => [f.key, f.max]));
  assert.equal(limits.html, 200_000);
  assert.equal(limits.css, 100_000);
  assert.equal(limits.js, 50_000);
  // The old pasted-embed block keeps its own, much smaller, default.
  const legacy = BLOCK_DEFS.find((d) => d.type === "customCode");
  assert.equal(legacy.fields.find((f) => f.key === "html").max, undefined);
});

test("a custom block round-trips its HTML and CSS through normalization unchanged", () => {
  const html = '<div class="wrap"><h2>Hello</h2><script>window.x=1</script></div>';
  const css = ".wrap { display: grid; grid-template-columns: repeat(3, 1fr) }";
  const block = normalizeBlock({ type: "custom", props: { html, css, js: "root.dataset.ok = '1'", width: "full", bare: true } }, identity);
  assert.equal(block.props.html, html, "HTML is not sanitized or escaped");
  assert.equal(block.props.css, css);
  assert.equal(block.props.js, "root.dataset.ok = '1'");
  assert.equal(block.props.width, "full");
  assert.equal(block.props.bare, true);
});

test("a custom block's html is truncated at its own limit, not the 20k code default", () => {
  const html = "x".repeat(150_000);
  const block = normalizeBlock({ type: "custom", props: { html } }, identity);
  assert.equal(block.props.html.length, 150_000);
});

test("an unknown width falls back to the site container rather than throwing", () => {
  const block = normalizeBlock({ type: "custom", props: { width: "enormous" } }, identity);
  assert.equal(block.props.width, "site");
});

test("a fresh custom block starts empty, so it renders nothing until written", () => {
  const block = createBlock("custom");
  assert.equal(block.props.html, "");
  assert.equal(block.props.css, "");
  assert.equal(block.props.js, "");
});

test("describeBlockTypes publishes each field's real size limit", () => {
  const described = describeBlockTypes().find((d) => d.type === "custom");
  const css = described.fields.find((f) => f.key === "css");
  assert.equal(css.maxLength, 100_000);
  const hero = describeBlockTypes().find((d) => d.type === "hero");
  assert.equal(hero.fields.find((f) => f.key === "heading").maxLength, 200);
});

test("a custom section carrying its own header or footer is rejected, not silently stripped", () => {
  const html = '<div><header class="nav"><a href="/">Logo</a></header><section><h2>Hi</h2></section><footer>x</footer></div>';
  assert.throws(
    () => normalizeBlock({ type: "custom", props: { html } }, identity),
    (error) => {
      assert.ok(error instanceof BlockValidationError);
      // Reports every offending tag in one go, so one retry fixes all of
      // them rather than discovering them one refusal at a time.
      assert.match(error.message, /<header>/);
      assert.match(error.message, /<footer>/);
      assert.match(error.message, /renders its own header/);
      return true;
    }
  );
});

test("every page-level tag is caught, including a whole pasted document", () => {
  for (const tag of ["header", "nav", "footer", "main", "html", "head", "body", "title"]) {
    assert.throws(
      () => normalizeBlock({ type: "custom", props: { html: `<${tag}>x</${tag}>` } }, identity),
      BlockValidationError,
      `<${tag}> should be rejected`
    );
  }
  // Self-closing and attribute-carrying forms too.
  assert.throws(() => normalizeBlock({ type: "custom", props: { html: '<nav class="x">y</nav>' } }, identity), BlockValidationError);
  assert.throws(() => normalizeBlock({ type: "custom", props: { html: "<header/>" } }, identity), BlockValidationError);
});

test("a tag that merely starts with a page-level tag's name is left alone", () => {
  // <navigation>, <header-bar>, <mainframe> are not <nav>/<header>/<main>.
  const html = '<div class="header-bar"><navigation-strip>a</navigation-strip><mainframe>b</mainframe></div>';
  assert.equal(findPageLevelTags(html).length, 0);
  const block = normalizeBlock({ type: "custom", props: { html } }, identity);
  assert.equal(block.props.html, html);
});

test("an ordinary section band saves fine", () => {
  const html = '<section class="band"><h2>Pricing</h2><a href="/contact">Talk to us</a></section>';
  assert.equal(findPageLevelTags(html).length, 0);
  assert.equal(normalizeBlock({ type: "custom", props: { html } }, identity).props.html, html);
});

test("the old customCode block is deprecated but still normalizes", () => {
  const legacy = BLOCK_DEFS.find((d) => d.type === "customCode");
  assert.equal(legacy.deprecated, true, "hidden from Add section");
  // Pages that already hold one must keep working, so it still accepts
  // input -- including the header markup the new block refuses, since
  // that rule is about newly designed sections, not old pasted embeds.
  const block = normalizeBlock({ type: "customCode", props: { html: "<header>legacy</header>" } }, identity);
  assert.equal(block.props.html, "<header>legacy</header>");
});

test("only one block type is offered for custom design", () => {
  const offered = BLOCK_DEFS.filter((d) => d.category === "Custom design" && !d.deprecated && !d.internal);
  assert.deepEqual(offered.map((d) => d.type), ["custom"]);
});

test("blockSummary gives the editor one line and the API the full rule", () => {
  const def = BLOCK_DEFS.find((d) => d.type === "custom");
  assert.equal(def.label, "Custom design");
  assert.ok(blockSummary(def).length < 80, "summary is one short line for the settings panel");
  assert.ok(def.description.length > 400, "description still carries the whole rule for an API/MCP client");
  // A block without its own summary falls back to the description.
  const hero = BLOCK_DEFS.find((d) => d.type === "hero");
  assert.equal(blockSummary(hero), hero.description);
});
