import test from "node:test";
import assert from "node:assert/strict";
import { hardcodedPageSource, hardcodedSourcePathForLabel } from "../src/lib/pageSourcesShape.ts";

test("contact source labels are deterministic and code-owned", () => {
  assert.equal(hardcodedPageSource("/"), "Website");
  assert.equal(hardcodedPageSource("/blog/how-to-launch"), "Blog");
  assert.equal(hardcodedPageSource("https://indishmarketer.com/courses/seo"), "Course");
  assert.equal(hardcodedPageSource("/webinars/growth"), "Webinar");
  assert.equal(hardcodedPageSource("/book/discovery-call"), "Meeting booking");
  assert.equal(hardcodedPageSource("/something-new"), "Website");
});

test("code-owned source labels have canonical public paths", () => {
  assert.equal(hardcodedSourcePathForLabel("Account"), "/signup");
  assert.equal(hardcodedSourcePathForLabel("Blog"), "/blog");
  assert.equal(hardcodedSourcePathForLabel("Course"), "/courses");
  assert.equal(hardcodedSourcePathForLabel("something else"), null);
});
