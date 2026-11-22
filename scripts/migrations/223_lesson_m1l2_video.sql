-- Module 1, Lesson 2 "Buying the server" now has its real recording,
-- cut from the owner's own screen capture with narration over the top,
-- so it stops showing the "being recorded" placeholder.
--
-- Scoped by the placeholder it replaces as well as by position, so it
-- can only ever swap the placeholder out. If this lesson has since been
-- given a different video by hand, this does nothing rather than
-- overwriting that upload.
UPDATE course_lessons
SET video_type = 'r2',
    video_ref = 'courses/7/videos/m1l2-buying-the-server.mp4'
WHERE video_ref = 'courses/7/videos/placeholder_lesson-coming-soon.mp4'
  AND position = 2
  AND module_id = (
    SELECT course_modules.id
    FROM course_modules
    JOIN courses ON courses.id = course_modules.course_id
    WHERE courses.slug = 'build-your-own-system'
      AND course_modules.position = 1
  );
