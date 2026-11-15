import test from "node:test";
import assert from "node:assert/strict";
import { resolveEmailBodySave } from "../src/lib/emailBlockSave.ts";
import { createEmailBlock } from "../src/lib/emailBlocks.ts";

test("Classic and HTML saves keep existing HTML while clearing the visual layout", () => {
  const html = '<h1>Welcome</h1><p>Keep this email.</p>';
  for (const blocks of [undefined, null, {}]) {
    assert.deepEqual(resolveEmailBodySave({ bodyHtml: html, blocks }), { bodyHtml: html, blocks: null });
  }
});

test("an explicitly empty visual layout may clear the body", () => {
  assert.deepEqual(resolveEmailBodySave({ bodyHtml: "old HTML", blocks: [] }), { bodyHtml: "", blocks: [] });
});

test("visual saves render blocks and retain unresolved merge tags", () => {
  const block = createEmailBlock("heading");
  block.props.text = "Hi {{first_name}}";
  const saved = resolveEmailBodySave({ bodyHtml: "old HTML", blocks: [block] });
  assert.equal(saved.blocks.length, 1);
  assert.ok(saved.bodyHtml.includes("Hi {{first_name}}"));
});

test("visual verification button keeps its workflow link attribute", () => {
  const block = createEmailBlock("button");
  block.props.href = "{{data.verification_url}}";
  const saved = resolveEmailBodySave({ bodyHtml: "", blocks: [block] });
  assert.ok(saved.bodyHtml.includes('href="{{data.verification_url}}"'));
});
