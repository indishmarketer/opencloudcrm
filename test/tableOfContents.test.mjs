import test from "node:test";
import assert from "node:assert/strict";
import { buildTableOfContents } from "../src/lib/tableOfContents.ts";

const MARKER = '<div class="blog-toc-marker"></div>';

test("buildTableOfContents leaves content unchanged with no marker, but still injects heading ids", () => {
  const html = "<h2>One</h2><p>Body</p><h2>Two</h2><p>Body</p><h2>Three</h2>";
  const result = buildTableOfContents(html);
  assert.doesNotMatch(result, /blog-toc/);
  assert.match(result, /<h2 id="one">One<\/h2>/);
  assert.match(result, /<h2 id="two">Two<\/h2>/);
});

test("buildTableOfContents replaces the marker with a nav listing headings", () => {
  const html = `<h2>Getting Started</h2><p>a</p>${MARKER}<h3>Step One</h3><p>b</p><h2>Wrap Up</h2>`;
  const result = buildTableOfContents(html);
  assert.doesNotMatch(result, /blog-toc-marker/);
  assert.match(result, /<nav aria-label="Table of contents"/);
  assert.match(result, /href="#getting-started"/);
  assert.match(result, /href="#step-one"/);
  assert.match(result, /href="#wrap-up"/);
  assert.match(result, /<h3 id="step-one">Step One<\/h3>/);
});

test("buildTableOfContents removes the marker below the 3-heading threshold", () => {
  const html = `<h2>One</h2>${MARKER}<h2>Two</h2>`;
  const result = buildTableOfContents(html);
  assert.doesNotMatch(result, /blog-toc-marker/);
  assert.doesNotMatch(result, /<nav/);
});

test("buildTableOfContents dedupes identical heading text", () => {
  const html = `<h2>FAQ</h2><h2>FAQ</h2><h2>FAQ</h2>${MARKER}`;
  const result = buildTableOfContents(html);
  assert.match(result, /href="#faq"/);
  assert.match(result, /href="#faq-2"/);
  assert.match(result, /href="#faq-3"/);
});

test("buildTableOfContents keeps an existing heading id instead of overwriting it", () => {
  const html = `<h2 id="custom-anchor">Section</h2><h2>Two</h2><h2>Three</h2>${MARKER}`;
  const result = buildTableOfContents(html);
  assert.match(result, /<h2 id="custom-anchor">Section<\/h2>/);
  assert.match(result, /href="#custom-anchor"/);
});

test("buildTableOfContents escapes heading text in the nav links", () => {
  const html = `<h2>Q&amp;A</h2><h2>Two</h2><h2>Three</h2>${MARKER}`;
  const result = buildTableOfContents(html);
  assert.match(result, />Q&amp;A<\/a>/);
});
