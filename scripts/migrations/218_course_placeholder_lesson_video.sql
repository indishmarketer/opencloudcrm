-- Every lesson of the new course was seeded with no video, which left the
-- course unpublishable: an empty player tells a buyer nothing and reads
-- as broken. A short placeholder clip saying the lesson is being recorded
-- is honest, and each lesson can be swapped to its real recording one at
-- a time without touching the others.
--
-- The object was uploaded to the private course-videos bucket under the
-- same key shape createCourseVideoUpload produces, so the signed-URL
-- player serves it exactly like any real upload.
--
-- Scoped to rows with no video_ref so this can never overwrite a real
-- recording, including on a re-run after lessons have been filled in.
UPDATE course_lessons
SET video_type = 'r2',
    video_ref = 'courses/7/videos/placeholder_lesson-coming-soon.mp4'
WHERE video_ref IS NULL
  AND module_id IN (
    SELECT course_modules.id
    FROM course_modules
    JOIN courses ON courses.id = course_modules.course_id
    WHERE courses.slug = 'build-your-own-system'
  );
