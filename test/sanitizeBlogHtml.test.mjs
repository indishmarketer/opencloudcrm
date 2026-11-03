import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeBlogHtml } from "../src/lib/sanitizeBlogHtml.ts";

test("sanitizeBlogHtml removes script tags", () => {
  const input = `<p>Hello</p><script>alert(1)</script>`;
  const out = sanitizeBlogHtml(input);
  assert.ok(!out.includes("<script"));
  assert.ok(out.includes("<p>Hello</p>"));
});

test("sanitizeBlogHtml strips javascript: URLs and event handlers", () => {
  const input = `<a href="javascript:alert(1)" onclick="alert(1)">click</a>`;
  const out = sanitizeBlogHtml(input);
  assert.ok(!out.includes("javascript:"));
  assert.ok(!out.includes("onclick"));
});

test("sanitizeBlogHtml allows safe tags and https links", () => {
  const input = `<p><strong>hi</strong> <a href="https://example.com">link</a></p>`;
  const out = sanitizeBlogHtml(input);
  assert.ok(out.includes("<strong>hi</strong>"));
  assert.ok(out.includes('href="https://example.com"'));
});

test("sanitizeBlogHtml only allows https for images", () => {
  const input = `<img src="https://images.indishmarketer.com/a.webp" alt="x"><img src="http://evil.com/b.png">`;
  const out = sanitizeBlogHtml(input);
  assert.ok(out.includes("images.indishmarketer.com"));
  assert.ok(!out.includes("evil.com"));
});

test("sanitizeBlogHtml allows only YouTube iframes", () => {
  const good = `<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>`;
  const bad = `<iframe src="https://evil.com/embed"></iframe>`;
  assert.ok(sanitizeBlogHtml(good).includes("youtube.com"));
  assert.ok(!sanitizeBlogHtml(bad).includes("evil.com"));
});

test("sanitizeBlogHtml escapes inline handlers even via transform", () => {
  const input = `<a href="https://example.com" target="_blank">x</a>`;
  const out = sanitizeBlogHtml(input);
  // transform adds rel for target blank
  assert.ok(out.includes('rel="noopener noreferrer"') || out.includes("noopener"));
});
