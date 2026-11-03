import test from "node:test";
import assert from "node:assert/strict";
import { extractYoutubeId } from "../src/lib/youtube.ts";

test("extractYoutubeId accepts bare 11-char id", () => {
  assert.equal(extractYoutubeId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("aBc123_-xyz"), "aBc123_-xyz");
});

test("extractYoutubeId parses watch URL", () => {
  assert.equal(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s"), "dQw4w9WgXcQ");
});

test("extractYoutubeId parses youtu.be short link", () => {
  assert.equal(extractYoutubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("http://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("extractYoutubeId parses embed and shorts", () => {
  assert.equal(extractYoutubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("extractYoutubeId trims and rejects invalid", () => {
  assert.equal(extractYoutubeId("  dQw4w9WgXcQ  "), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("https://example.com"), null);
  assert.equal(extractYoutubeId("not-a-youtube-id"), null);
  assert.equal(extractYoutubeId("https://youtube.com/watch?v=short"), null);
  assert.equal(extractYoutubeId(""), null);
});

test("extractYoutubeId is case sensitive and exact 11 chars", () => {
  assert.equal(extractYoutubeId("https://www.youtube.com/watch?v=ABCdef12345"), "ABCdef12345");
  // 10 chars should fail even as bare id
  assert.equal(extractYoutubeId("ABCdef1234"), null);
});
