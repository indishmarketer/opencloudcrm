import test from "node:test";
import assert from "node:assert/strict";

const { cleanToolUrl, PRICING_TYPES, STATUS_LABELS, TOOL_STATUSES } = await import("../src/lib/directoryFields.ts");

test("tool links accept websites and GitHub repos", () => {
  assert.equal(cleanToolUrl("https://tale.dev"), "https://tale.dev/");
  assert.equal(cleanToolUrl(" https://github.com/n8n-io/n8n "), "https://github.com/n8n-io/n8n");
  assert.equal(cleanToolUrl("http://example.com/x?y=1"), "http://example.com/x?y=1");
});

test("tool links refuse script, data, and credential URLs", () => {
  assert.equal(cleanToolUrl("javascript:alert(1)"), null);
  assert.equal(cleanToolUrl("data:text/html,hi"), null);
  assert.equal(cleanToolUrl("https://user:pass@example.com"), null);
  assert.equal(cleanToolUrl("not a url"), null);
  assert.equal(cleanToolUrl(""), null);
  assert.equal(cleanToolUrl(42), null);
});

test("every status has a label and pricing types are stable", () => {
  for (const s of TOOL_STATUSES) assert.ok(STATUS_LABELS[s]);
  assert.deepEqual([...PRICING_TYPES], ["free", "freemium", "paid", "free_api", "paid_api"]);
});

const { parseDescription, metaFromDescription, screenshotAlt } = await import("../src/lib/directoryFields.ts");

test("descriptions split into paragraphs, headings, and lists", () => {
  const blocks = parseDescription("Intro line one\nstill intro.\n\n## What it does\n- Fast\n- Cheap\n\nLast bit.");
  assert.deepEqual(blocks, [
    { type: "paragraph", text: "Intro line one still intro." },
    { type: "heading", text: "What it does" },
    { type: "list", items: ["Fast", "Cheap"] },
    { type: "paragraph", text: "Last bit." },
  ]);
  assert.deepEqual(parseDescription(null), []);
});

test("meta snippet uses the first paragraph and cuts on a word", () => {
  assert.equal(metaFromDescription("## Heading\n\nShort intro.\n\nMore."), "Short intro.");
  const long = metaFromDescription("word ".repeat(60));
  assert.ok(long.length <= 160 && long.endsWith("...") && !long.includes("wor..."));
});

test("screenshot alt falls back to the tool name", () => {
  assert.equal(screenshotAlt("Stripe", "u1", { u1: "Stripe pricing page" }, 0), "Stripe pricing page");
  assert.equal(screenshotAlt("Stripe", "u2", {}, 1), "Stripe screenshot 2");
});
