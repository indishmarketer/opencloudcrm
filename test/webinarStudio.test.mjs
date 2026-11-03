import test from "node:test";
import assert from "node:assert/strict";
import { getWebinarReadiness } from "../src/lib/webinarStudio.ts";

test("publishing readiness reports every missing conversion essential", () => {
  assert.deepEqual(getWebinarReadiness({ title: "Draft" }), [
    "Add a clear description",
    "Upload a thumbnail",
    "Add the presenter",
    "Add at least 3 takeaways",
    "Upload a processed video",
    "Add an active broadcast schedule",
  ]);
});

test("publishing readiness passes for a complete webinar", () => {
  assert.deepEqual(getWebinarReadiness({
    title: "A useful session",
    description: "A complete explanation of what viewers will learn.",
    thumbnail_url: "/images/webinar.webp",
    presenter_name: "Presenter",
    key_takeaways: ["One", "Two", "Three"],
    mux_playback_id: "playback-id",
    active_schedule_count: 1,
  }), []);
});
