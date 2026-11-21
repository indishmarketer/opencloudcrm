-- The $9 follow-up to the free guide. The guide explains the idea; this
-- shows it happening on a real server.
--
-- Seeded here rather than clicked into the console so the curriculum is
-- reviewable in the diff and arrives the same way on any deployment, the
-- same pattern migration 207 uses for the transactional emails. It stays
-- unpublished: the lessons have no video yet, and course_lessons.video_ref
-- is deliberately left null until each recording exists.
--
-- Priced at 9 USD. The owner sets one price in one currency and
-- src/lib/currency.ts derives the other at display and charge time, so
-- Razorpay charges live-rate rupees without a second figure to maintain.
INSERT INTO courses (slug, title, subtitle, description, cover_image_url, price, price_currency, published)
VALUES (
  'build-your-own-system',
  'Build Your Own System',
  'Go from an empty folder to a live site on your own server, with an AI agent doing the typing',
  'The free guide explains why one server, a few API keys and an AI agent can replace a pile of monthly subscriptions. This course shows it happening. You watch the whole thing end to end: buying the server, letting the agent install Coolify through the browser, going from an empty folder to a landing page that captures real signups, plugging in file storage and email, and keeping it all running afterwards. No prior coding needed. Around 70 minutes, in short lessons you can follow along with.',
  'https://images.indishmarketer.com/courses/build-your-own-system-cover.webp',
  9,
  'USD',
  false
)
ON CONFLICT (slug) DO NOTHING;

-- Curriculum only on first seed, so re-running never duplicates or
-- overwrites edits made in Course Studio afterwards.
WITH course AS (
  SELECT id FROM courses WHERE slug = 'build-your-own-system'
), fresh AS (
  SELECT course.id
  FROM course
  WHERE NOT EXISTS (SELECT 1 FROM course_modules WHERE course_id = course.id)
), new_modules AS (
  INSERT INTO course_modules (course_id, title, description, tier, position)
  SELECT fresh.id, m.title, m.description, 'pro', m.position
  FROM fresh
  CROSS JOIN (VALUES
    (1, 'Get your machine running',
     'Rent the server, point your domain at it, and let the agent set the whole thing up while you watch.'),
    (2, 'From empty folder to live page',
     'Your first real build: protect your keys, let the agent make the repo, and ship a page that collects signups.'),
    (3, 'Plug in the services',
     'Give it somewhere to put files and a way to send email that actually arrives.'),
    (4, 'Run it without fear',
     'What to do when something breaks, how to keep your keys safe, and how to let the agent work on its own.')
  ) AS m(position, title, description)
  RETURNING id, position
)
INSERT INTO course_lessons (module_id, title, description, video_type, video_ref, position)
SELECT new_modules.id, l.title, l.description, 'r2', NULL, l.position
FROM new_modules
JOIN (VALUES
  -- Module 1
  (1, 1, 'What you are about to build',
   'The finished system first, so you know where this is going and what each piece is for.'),
  (1, 2, 'Buying the server',
   'Picking a VPS and a size. Why you can start small and resize later without rebuilding anything.'),
  (1, 3, 'Pointing your domain at it',
   'Connecting the domain through Cloudflare, and why the server sits behind it.'),
  (1, 4, 'Letting the agent install Coolify',
   'Handing the agent your browser and watching it do the setup. What to watch for, and what to do about the keys afterwards.'),
  -- Module 2
  (2, 1, 'The first thing you type, every time',
   'Creating the secrets file and getting it into .gitignore before anything else exists.'),
  (2, 2, 'Let it make the repository',
   'You do not need to know Git. What to ask for, and how to check it worked.'),
  (2, 3, 'Your first prompt',
   'Asking for one small real thing: a page, a form, a welcome email and somewhere to see who signed up.'),
  (2, 4, 'Deploy and look at it',
   'Getting it onto your domain, then telling the agent what is wrong and watching it fix it.'),
  -- Module 3
  (3, 1, 'Somewhere to put files',
   'Setting up Cloudflare R2 for images and downloads, and why you do not serve them off your own box.'),
  (3, 2, 'Email that actually arrives',
   'Connecting Amazon SES, and the records you need so your mail is not treated as spam.'),
  (3, 3, 'Adding one more service',
   'The same pattern for anything else: bookings, WhatsApp, video. Once you have done two, they are all the same.'),
  -- Module 4
  (4, 1, 'When something breaks',
   'Reading the logs, telling the agent what you see, and rolling back when you need to.'),
  (4, 2, 'Backups and rotating your keys',
   'The two maintenance jobs worth doing, and how to hand them to the agent.'),
  (4, 3, 'Giving the agent its own door',
   'Connecting an MCP server so it can read your leads and publish for you without the admin panel.')
) AS l(module_position, position, title, description)
  ON l.module_position = new_modules.position;
