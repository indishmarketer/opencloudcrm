import test from "node:test";
import assert from "node:assert/strict";
import { htmlToText } from "../src/lib/htmlToText.ts";

test("htmlToText keeps link targets, paragraphs and list items", () => {
  const html = `<html><head><style>p{color:red}</style></head><body>
    <p>Hi Asha,</p><p>Your course is <strong>ready</strong>.</p>
    <a href="https://www.indishmarketer.com/x?a=1&amp;b=2">Open course</a>
    <ul><li>One</li><li>Two</li></ul>
    <img src="https://www.indishmarketer.com/api/email/track/open?t=abc" width="1" height="1">
  </body></html>`;
  const text = htmlToText(html);
  assert.match(text, /^Hi Asha,\n\nYour course is ready\./);
  assert.match(text, /Open course \(https:\/\/www\.indishmarketer\.com\/x\?a=1&b=2\)/);
  assert.match(text, /- One\n- Two/);
  assert.doesNotMatch(text, /color:red|track\/open|<|>/);
});

test("htmlToText decodes entities and shows bare links once", () => {
  assert.equal(htmlToText("<p>Tom &amp; Jerry&#39;s &lt;3</p>"), "Tom & Jerry's <3");
  assert.equal(htmlToText('<a href="https://a.com/">https://a.com/</a>'), "https://a.com/");
});
