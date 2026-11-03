-- Owner feedback (2026-08-22): the course description read like an
-- internal status note ("course is active, pre-launch, video lessons
-- being recorded") instead of customer-facing copy, and these lessons are
-- explicitly written for non-coders who shouldn't see build-process
-- language at all. Rewritten to match the actual tone of the other two
-- courses (see courses/3-day-reddit-marketing-challenge and
-- medium-writing-monetization-challenge's own descriptions: "A complete
-- system for [audience] who want to [outcome]. Covers [topics]."), with
-- one plain, warm sentence about the early-bird price instead of any
-- internal build-status language. The description field is plain text
-- (no HTML/markdown support in courses/[slug]/page.tsx), so "bold" price
-- emphasis isn't possible here -- the price already renders bold
-- separately in the pricing section below the description.

UPDATE courses
SET
  subtitle = 'Build and deploy your own business platform with AI coding agents',
  description = 'A complete system for founders and creators who want to build and run their own business platform without hiring a dev team, using AI coding agents instead of writing everything by hand. Covers deployment, accounts, payments, courses, community, admin tools, email automation, and SEO. Grab it now at the early-bird price while the video library is being recorded, before it moves to full price.'
WHERE slug = 'build-deploy-your-own-ai-agency';
