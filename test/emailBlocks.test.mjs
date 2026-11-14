import test from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_BLOCK_DEFS,
  createEmailBlock,
  getEmailBlockDef,
  normalizeEmailBlocks,
} from "../src/lib/emailBlocks.ts";
import { renderEmailBlocksToHtml, renderFooterPreview } from "../src/lib/emailBlocksRender.ts";

test("every block type has a fresh-block factory with a real value for every field", () => {
  for (const def of EMAIL_BLOCK_DEFS) {
    const block = createEmailBlock(def.type);
    assert.equal(block.type, def.type);
    for (const field of [...def.fields, ...def.styleFields]) {
      assert.notEqual(block.props[field.key], undefined, `${def.type}.${field.key} has no default`);
    }
  }
});

test("createEmailBlock throws on an unknown type rather than silently producing a broken block", () => {
  assert.throws(() => createEmailBlock("not-a-real-type"));
});

test("normalizeEmailBlocks drops unknown block types and stray keys, keeps everything else", () => {
  const out = normalizeEmailBlocks([
    { type: "heading", props: { text: "Hi", evilKey: "<script>" } },
    { type: "not-a-real-type", props: {} },
    "not even an object",
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "heading");
  assert.equal(out[0].props.text, "Hi");
  assert.equal(out[0].props.evilKey, undefined);
});

test("normalizeEmailBlocks caps the array length", () => {
  const many = Array.from({ length: 200 }, () => ({ type: "divider", props: {} }));
  assert.ok(normalizeEmailBlocks(many).length <= 60);
});

test("every renderer emits only table-based, inline-style markup -- no class attributes, which a mail client (Outlook) may strip along with any <style> block", () => {
  for (const def of EMAIL_BLOCK_DEFS) {
    if (def.type === "footer") continue; // footer never renders into body_html -- see its own test below
    const block = createEmailBlock(def.type);
    // Give link/image fields something real so every renderer actually
    // produces output instead of short-circuiting on an empty href.
    if (def.type === "button") block.props = { ...block.props, label: "Go", href: "https://example.com" };
    if (def.type === "image") block.props = { ...block.props, src: "https://example.com/a.png" };
    if (def.type === "socialIcons") block.props = { ...block.props, facebook: "https://facebook.com/x" };
    const html = renderEmailBlocksToHtml([block]);
    assert.ok(!html.includes("class="), `${def.type} must not emit a class attribute`);
  }
});

test("renderEmailBlocksToHtml wraps every block's row in one top-level table", () => {
  const blocks = [createEmailBlock("heading"), createEmailBlock("divider")];
  const html = renderEmailBlocksToHtml(blocks);
  assert.match(html, /^<table role="presentation"/);
  assert.ok(html.includes("<tr>"));
});

test("an empty block list renders to an empty string, not an empty table shell", () => {
  assert.equal(renderEmailBlocksToHtml([]), "");
});

test("merge tags substitute in heading/text/button, raw (not auto-escaped, matching emailTemplates.ts's applyTemplateVars contract)", () => {
  const heading = getEmailBlockDef("heading");
  const block = { id: "a", type: "heading", props: { ...heading.defaults, text: "Hi {{first_name}}" } };
  const html = renderEmailBlocksToHtml([block], { first_name: "Jo" });
  assert.ok(html.includes("Hi Jo"));
});

test("heading/button text is HTML-escaped -- a stray angle bracket in a merge-tag value can't inject markup", () => {
  const heading = getEmailBlockDef("heading");
  const block = { id: "a", type: "heading", props: { ...heading.defaults, text: "Hi {{name}}" } };
  const html = renderEmailBlocksToHtml([block], { name: "<img src=x onerror=alert(1)>" });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
});

test("a relative href is dropped on Button/Image/SocialIcons -- it would be meaningless once the markup leaves the site inside an email", () => {
  const button = { id: "a", type: "button", props: { ...getEmailBlockDef("button").defaults, label: "Go", href: "/contact" } };
  assert.equal(renderEmailBlocksToHtml([button]), "");
});

test("an absolute https/mailto/tel href on Button is kept", () => {
  for (const href of ["https://example.com", "mailto:a@b.com", "tel:+15551234567"]) {
    const button = { id: "a", type: "button", props: { ...getEmailBlockDef("button").defaults, label: "Go", href } };
    assert.ok(renderEmailBlocksToHtml([button]).includes(href));
  }
});

test("renderFooterPreview escapes the business name/address and never renders a class attribute", () => {
  const html = renderFooterPreview({ textColor: "#111111", linkColor: "#dc2626" }, "<b>Acme</b>", "1 Main St");
  assert.ok(html.includes("&lt;b&gt;Acme&lt;/b&gt;"));
  assert.ok(!html.includes("class="));
  assert.ok(html.includes("Unsubscribe"));
});
