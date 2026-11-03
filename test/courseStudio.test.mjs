import test from "node:test";
import assert from "node:assert/strict";
import {
  courseCreateSchema,
  courseLessonSchema,
  courseReorderSchema,
  evaluateCoursePublicationReadiness,
  normalizeCourseVideoRef,
  parsePositiveId,
} from "../src/lib/courseStudio.ts";

test("course creation accepts a clean title and slug", () => {
  const result = courseCreateSchema.safeParse({ title: "A Real Course", slug: "a-real-course" });
  assert.equal(result.success, true);
});

test("course video references normalize YouTube URLs and stay scoped to their course", () => {
  assert.deepEqual(normalizeCourseVideoRef("youtube", "https://youtu.be/dQw4w9WgXcQ", 12), { value: "dQw4w9WgXcQ" });
  assert.deepEqual(normalizeCourseVideoRef("r2", "courses/12/videos/file.mp4", 12), { value: "courses/12/videos/file.mp4" });
  assert.ok("error" in normalizeCourseVideoRef("r2", "courses/99/videos/file.mp4", 12));
  assert.ok("error" in normalizeCourseVideoRef("youtube", "not-a-valid-video", 12));
});

test("course creation rejects malformed and traversal-like slugs", () => {
  for (const slug of ["Has Spaces", "../admin", "course/lesson", "-course", "course-"]) {
    assert.equal(courseCreateSchema.safeParse({ title: "Course", slug }).success, false);
  }
});

test("course lesson input limits tier-independent video types and ids", () => {
  const base = { module_id: 2, title: "Lesson", description: null, video_ref: null, position: 1 };
  assert.equal(courseLessonSchema.safeParse({ ...base, video_type: "youtube" }).success, true);
  assert.equal(courseLessonSchema.safeParse({ ...base, video_type: "filesystem" }).success, false);
  assert.equal(courseLessonSchema.safeParse({ ...base, module_id: -1, video_type: "r2" }).success, false);
});

test("reorder validation rejects duplicate ids", () => {
  const parsed = courseReorderSchema.safeParse({ updates: [{ id: 1, position: 1 }, { id: 1, position: 2 }] });
  assert.equal(parsed.success, false);
});

test("publication readiness protects paid and incomplete drafts", () => {
  const issues = evaluateCoursePublicationReadiness({
    title: "Draft",
    slug: "draft",
    description: "",
    coverImageUrl: null,
    moduleCount: 1,
    lessonCount: 1,
    hasProTier: true,
    price: null,
    missingVideoCount: 1,
  });
  assert.ok(issues.some((issue) => /Description/.test(issue)));
  assert.ok(issues.some((issue) => /Cover/.test(issue)));
  assert.ok(issues.some((issue) => /PRO modules/.test(issue)));
  assert.ok(issues.some((issue) => /missing a video/.test(issue)));
});

test("publication readiness accepts a complete free course", () => {
  assert.deepEqual(evaluateCoursePublicationReadiness({
    title: "Free Course",
    slug: "free-course",
    description: "Complete description",
    coverImageUrl: "https://images.indishmarketer.com/course.webp",
    moduleCount: 1,
    lessonCount: 2,
    hasProTier: false,
    price: null,
    missingVideoCount: 0,
  }), []);
});

test("positive id parsing rejects zero, decimals, and non-numbers", () => {
  assert.equal(parsePositiveId("12"), 12);
  assert.equal(parsePositiveId("0"), null);
  assert.equal(parsePositiveId("1.5"), null);
  assert.equal(parsePositiveId("not-a-number"), null);
});
