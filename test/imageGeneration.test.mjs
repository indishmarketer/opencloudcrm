import test from "node:test";
import assert from "node:assert/strict";
import { MAX_SVG_SOURCE_LENGTH, rejectUnsafeSvg } from "../src/lib/imagePolicy.ts";
import { defaultProvider, imageGenerationStatus } from "../src/lib/imageGeneration.ts";

const ok = (svg) => assert.equal(rejectUnsafeSvg(svg), null, `expected accepted: ${svg.slice(0, 60)}`);
const rejected = (svg, pattern) => {
  const problem = rejectUnsafeSvg(svg);
  assert.ok(problem, `expected rejected: ${svg.slice(0, 60)}`);
  if (pattern) assert.match(problem, pattern);
};

test("self-contained SVG is accepted", () => {
  ok('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#0a0a0a"/></svg>');
  // The xmlns attribute is a URL but not a fetched reference, so it must
  // not be mistaken for one.
  ok('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><text x="0" y="1">hi</text></svg>');
});

test("gradients, filters and #fragment references are accepted", () => {
  ok(
    '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>' +
      '<rect fill="url(#g)" width="4" height="4"/><use href="#g"/></svg>'
  );
});

test("an inline data:image URI is accepted, since nothing is fetched", () => {
  ok('<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgo=" width="4" height="4"/></svg>');
});

test("an SVG that would make the server fetch a URL is rejected", () => {
  // The whole point: librsvg resolves these while rendering, on our box,
  // which would turn "draw me a picture" into a fetch of the caller's
  // chosen URL -- cloud metadata endpoints included.
  rejected('<svg xmlns="http://www.w3.org/2000/svg"><image href="http://169.254.169.254/latest/meta-data/" /></svg>', /references/);
  rejected('<svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="https://example.com/a.png" /></svg>', /references/);
  rejected('<svg xmlns="http://www.w3.org/2000/svg"><image src="/etc/passwd" /></svg>', /references/);
  rejected('<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///etc/passwd" /></svg>', /references/);
});

test("script, foreignObject and entity declarations are rejected", () => {
  rejected('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', /script/i);
  rejected('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><b>x</b></foreignObject></svg>', /foreignObject/i);
  rejected('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>', /[Ee]ntity/);
});

test("non-SVG input and oversized input are rejected with a reason", () => {
  rejected("just some text", /does not look like SVG/);
  rejected("<div>not svg</div>", /does not look like SVG/);
  rejected(`<svg >${"x".repeat(MAX_SVG_SOURCE_LENGTH + 1)}</svg>`, /over the/);
});

test("image generation reports itself unavailable with no provider key", () => {
  const saved = { ...process.env };
  for (const key of ["POLLINATIONS_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "IMAGE_PROVIDER"]) delete process.env[key];
  try {
    const status = imageGenerationStatus();
    assert.equal(status.available, false);
    assert.equal(status.defaultProvider, null);
    assert.equal(defaultProvider(), null);
    // The other upload paths are unaffected, so the roster still lists
    // every provider with how to switch it on.
    assert.deepEqual(status.providers.map((p) => p.name), ["pollinations", "openai", "gemini"]);
    assert.ok(status.providers.every((p) => p.configured === false && p.keyEnv && p.model));
  } finally {
    Object.assign(process.env, saved);
  }
});

test("one key is enough: that provider becomes the default with no IMAGE_PROVIDER set", () => {
  const saved = { ...process.env };
  for (const key of ["POLLINATIONS_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "IMAGE_PROVIDER"]) delete process.env[key];
  process.env.GEMINI_API_KEY = "test-key";
  try {
    assert.equal(defaultProvider(), "gemini");
    assert.equal(imageGenerationStatus().available, true);
  } finally {
    Object.assign(process.env, saved);
  }
});

test("IMAGE_PROVIDER picks between several keys, and is ignored when its own key is missing", () => {
  const saved = { ...process.env };
  for (const key of ["POLLINATIONS_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) delete process.env[key];
  process.env.POLLINATIONS_API_KEY = "a";
  process.env.OPENAI_API_KEY = "b";
  try {
    process.env.IMAGE_PROVIDER = "openai";
    assert.equal(defaultProvider(), "openai");
    // Naming a provider with no key must not break the feature outright,
    // it falls back to one that is actually usable.
    process.env.IMAGE_PROVIDER = "gemini";
    assert.equal(defaultProvider(), "pollinations");
    process.env.IMAGE_PROVIDER = "  OpenAI  ";
    assert.equal(defaultProvider(), "openai", "trimmed and case-insensitive");
  } finally {
    Object.assign(process.env, saved);
  }
});

test("a configured provider's model comes from its env var, else its default", () => {
  const saved = { ...process.env };
  process.env.POLLINATIONS_API_KEY = "a";
  delete process.env.POLLINATIONS_IMAGE_MODEL;
  try {
    const byName = (name) => imageGenerationStatus().providers.find((p) => p.name === name);
    assert.equal(byName("pollinations").model, "gpt-image-2");
    process.env.POLLINATIONS_IMAGE_MODEL = "black-forest-labs/flux.2-pro";
    assert.equal(byName("pollinations").model, "black-forest-labs/flux.2-pro");
  } finally {
    Object.assign(process.env, saved);
  }
});
