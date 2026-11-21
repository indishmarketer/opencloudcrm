import test from "node:test";
import assert from "node:assert/strict";
import { hardcodedPageSource, hardcodedSourcePathForLabel } from "../src/lib/pageSourcesShape.ts";

test("contact source labels are deterministic and code-owned", () => {
  assert.equal(hardcodedPageSource("/"), "Home page");
  assert.equal(hardcodedPageSource("/blog/how-to-launch"), "Blog");
  assert.equal(hardcodedPageSource("https://indishmarketer.com/courses/seo"), "Course");
  assert.equal(hardcodedPageSource("/webinars/growth"), "Webinar");
  assert.equal(hardcodedPageSource("/book/discovery-call"), "Meeting booking");
});

test("an unrecognised page is named after itself, never 'Website'", () => {
  // "Website" used to be both the home-page label and the fallback for any
  // unmatched path, so it was indistinguishable from "we didn't record it".
  assert.equal(hardcodedPageSource("/something-new"), "Something new");
  assert.equal(hardcodedPageSource("/free-guide/seo-checklist"), "Free guide");
  // Capped at MAX_SOURCE_WORDS so the label always survives cleanSourceLabel.
  assert.equal(hardcodedPageSource("/one-two-three-four-five"), "One two three");
  assert.equal(hardcodedPageSource(""), "Home page");
  assert.equal(hardcodedPageSource(null), "Home page");
});

test("code-owned source labels have canonical public paths", () => {
  assert.equal(hardcodedSourcePathForLabel("Account"), "/signup");
  assert.equal(hardcodedSourcePathForLabel("Blog"), "/blog");
  assert.equal(hardcodedSourcePathForLabel("Course"), "/courses");
  // Free-guide leads keep their source label, but it no longer points at a
  // public page because delivery happens through the homepage popup.
  assert.equal(hardcodedSourcePathForLabel("Free guide"), null);
  assert.equal(hardcodedSourcePathForLabel("something else"), null);
});
