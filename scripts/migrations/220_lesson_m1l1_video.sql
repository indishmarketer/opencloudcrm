-- Module 1, Lesson 1 has its real recording now, so it stops showing the
-- "being recorded" placeholder. The other thirteen lessons keep theirs
-- until each one is filmed.
--
-- Scoped by lesson id AND by the placeholder it is replacing, so this can
-- only ever swap the placeholder out. If the lesson has since been given
-- a different video by hand, this does nothing rather than overwriting
-- someone's upload.
UPDATE course_lessons
SET video_type = 'r2',
    video_ref = 'courses/7/videos/m1l1-what-you-are-about-to-build.mp4'
WHERE video_ref = 'courses/7/videos/placeholder_lesson-coming-soon.mp4'
  AND position = 1
  AND module_id = (
    SELECT course_modules.id
    FROM course_modules
    JOIN courses ON courses.id = course_modules.course_id
    WHERE courses.slug = 'build-your-own-system'
      AND course_modules.position = 1
  );
