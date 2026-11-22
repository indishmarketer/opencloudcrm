-- Update Module 1, Lesson 2 title and description.
-- The lesson covers both picking and buying the VPS and setting it up
-- with the Coolify template pre-installed so the server is ready to use.
UPDATE course_lessons
SET title = 'Buying and setting up the server',
    description = 'Picking the right VPS plan, choosing your server location, and setting it up with Coolify pre-installed so your server is ready to go.'
WHERE position = 2
  AND module_id = (
    SELECT course_modules.id
    FROM course_modules
    JOIN courses ON courses.id = course_modules.course_id
    WHERE courses.slug = 'build-your-own-system'
      AND course_modules.position = 1
  );
