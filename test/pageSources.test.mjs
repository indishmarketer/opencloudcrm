import test from "node:test";
import assert from "node:assert/strict";
import { hardcodedPageSource } from "../src/lib/pageSourcesShape.ts";

test("contact source labels are deterministic and code-owned", () => {
  assert.equal(hardcodedPageSource("/"), "Website");
  assert.equal(hardcodedPageSource("/blog/how-to-launch"), "Blog");
  assert.equal(hardcodedPageSource("https://indishmarketer.com/courses/seo"), "Course");
  assert.equal(hardcodedPageSource("/webinars/growth"), "Webinar");
  assert.equal(hardcodedPageSource("/book/discovery-call"), "Meeting booking");
  assert.equal(hardcodedPageSource("/something-new"), "Website");
});
