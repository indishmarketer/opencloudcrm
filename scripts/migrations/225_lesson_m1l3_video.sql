-- Module 1, Lesson 3 "Pointing your domain to Coolify" now has its real video,
-- cut from the screen capture with synchronized voiceover narration,
-- minimal motion graphics opener and outro cards, and privacy blurs.
UPDATE course_lessons
SET video_type = 'r2',
    video_ref = 'courses/7/videos/m1l3-pointing-your-domain-to-coolify.mp4',
    title = 'Pointing your domain to Coolify',
    description = 'Connecting your domain through Cloudflare, configuring your Coolify subdomain, and restarting the proxy for automatic SSL.'
WHERE position = 3
  AND module_id = (
    SELECT course_modules.id
    FROM course_modules
    JOIN courses ON courses.id = course_modules.course_id
    WHERE courses.slug = 'build-your-own-system'
      AND course_modules.position = 1
  );
