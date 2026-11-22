-- Course pages were a title, a paragraph and a module list. That is
-- enough to describe a course and not nearly enough to decide to buy
-- one: no outcomes, no idea who it is for, nothing about what you need
-- first, and no answers to the obvious questions.
--
-- One jsonb column rather than four tables. These are short lists of
-- strings rendered in a fixed order, never queried or joined, so rows
-- and foreign keys would buy nothing. Shape:
--   { "outcomes": [..], "audience": [..], "requirements": [..],
--     "faq": [{ "q": "..", "a": ".." }] }
-- Any key may be absent, and the page skips whatever is missing, so an
-- older course with no sections renders exactly as it does today.
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN courses.sections IS
  'Optional selling sections for the public course page: outcomes, audience, requirements, faq.';

-- Seeded only where nothing has been written yet, so re-running cannot
-- overwrite copy edited later in the console or over the API.
UPDATE courses SET sections = jsonb_build_object(
  'outcomes', jsonb_build_array(
    'Rent a server and get it running, without touching a command line you do not understand',
    'Put a real page online on your own domain that collects signups',
    'Send email from your own setup so it actually reaches the inbox',
    'Ask an AI agent for a change and watch it ship, instead of waiting on a roadmap',
    'Know what each piece costs you, so there are no surprise bills'
  ),
  'audience', jsonb_build_array(
    'You pay for several tools every month and barely use most of them',
    'You are not a developer and do not plan to become one',
    'You want to own what you build instead of renting it',
    'You have an hour to follow along and a card for a small server'
  ),
  'requirements', jsonb_build_array(
    'A card to pay for a small server, usually a few dollars a month',
    'A domain name, or the willingness to buy one',
    'An AI coding agent such as Claude Code or Codex',
    'No coding experience at all'
  ),
  'faq', jsonb_build_array(
    jsonb_build_object('q', 'Do I need to know how to code?',
      'a', 'No. You describe what you want in plain English and the agent writes it. The course is built for people who have never written code.'),
    jsonb_build_object('q', 'What will this cost me every month after the course?',
      'a', 'A small server is usually a few dollars a month. The other services are pay as you use, and at the size most people start at that comes to cents. There is no subscription to me.'),
    jsonb_build_object('q', 'All the lessons are not out yet. What am I paying for?',
      'a', 'Lessons go up one at a time and your price covers every one of them as it lands. You do not pay again later.'),
    jsonb_build_object('q', 'Is this just about saving money?',
      'a', 'No. The bigger reason is that you can build whatever you want, instead of waiting for a company to add a feature or being told it is not on the plan you are paying for.'),
    jsonb_build_object('q', 'What if I get stuck?',
      'a', 'Reply to any email from me and tell me where it broke. You can also book a call and I will look at your setup with you.')
  )
)
WHERE slug = 'build-your-own-system' AND sections = '{}'::jsonb;

UPDATE courses SET sections = jsonb_build_object(
  'outcomes', jsonb_build_array(
    'Write articles on Medium that people actually find and read',
    'Use AI to draft faster without sounding like everyone else',
    'Get accepted into the Partner Program and start earning',
    'Bring readers in from outside Medium instead of waiting for the feed',
    'Turn articles into affiliate income that keeps paying'
  ),
  'audience', jsonb_build_array(
    'Writers and creators who want an audience without building a website first',
    'Freelancers who want writing to bring in leads',
    'Anyone who has published on Medium and seen it go nowhere'
  ),
  'requirements', jsonb_build_array(
    'A Medium account, free to create',
    'An AI writing tool such as ChatGPT or Claude',
    'A few hours a week to write and publish'
  ),
  'faq', jsonb_build_array(
    jsonb_build_object('q', 'Do I need an audience already?',
      'a', 'No. The course is about getting found by people who do not know you yet.'),
    jsonb_build_object('q', 'Will AI writing get me penalised?',
      'a', 'Not if you use it the way the course shows. The drafting is assisted, the thinking and the edit are yours.'),
    jsonb_build_object('q', 'How long before I earn anything?',
      'a', 'That depends on how often you publish. The course covers the Partner Program and affiliate income, which is the part most people leave on the table.')
  )
)
WHERE slug = 'medium-writing-monetization-challenge' AND sections = '{}'::jsonb;

UPDATE courses SET sections = jsonb_build_object(
  'outcomes', jsonb_build_array(
    'Find the subreddits where your buyers already are',
    'Post and comment without getting removed by moderators',
    'Build enough karma and trust to be taken seriously',
    'Turn Reddit threads into direct messages and sales conversations'
  ),
  'audience', jsonb_build_array(
    'Marketers and founders who need leads without an ad budget',
    'Anyone who has been banned or removed from Reddit and does not know why',
    'People who want traffic that does not stop when they stop paying'
  ),
  'requirements', jsonb_build_array(
    'A Reddit account',
    'Something to offer, a product, a service or a newsletter',
    'Three days of effort'
  ),
  'faq', jsonb_build_array(
    jsonb_build_object('q', 'Will I get banned for promoting?',
      'a', 'Not if you follow the approach in the course. Most bans come from posting like an advert in a community that was never going to accept one.'),
    jsonb_build_object('q', 'Do I need karma before I start?',
      'a', 'No. Building it is part of the three days.'),
    jsonb_build_object('q', 'Does this work outside the United States?',
      'a', 'Yes. The method is about finding the right subreddit, and those exist for almost every country and niche.')
  )
)
WHERE slug = '3-day-reddit-marketing-challenge' AND sections = '{}'::jsonb;
