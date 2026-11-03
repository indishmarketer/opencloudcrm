-- Two owner-requested changes to "Build & Deploy Your Own AI Agency"
-- (2026-08-22):
--
-- 1. Make it fully PRO, no free tier -- same pattern as the 3-Day Reddit
--    Marketing Challenge (courses/[slug]/page.tsx already switches its
--    top CTA to "Buy Now" and drops the free-enroll flow automatically
--    once no module is tier='free' -- no code change needed, this is the
--    same has_free_tier / hasFreeTier logic already live for Reddit).
--
-- 2. Set price_usd directly on the row. Root cause of "PayPal missing"
--    bug found: the course LANDING page computes USD live via
--    inrToUsd(price_inr) and passes that to UnlockProModal, but the
--    ACCOUNT DASHBOARD ("Unlock PRO" section) and the LESSON PAYWALL
--    popup both read the raw `courses.price_usd` column directly instead
--    (src/app/account/courses/[slug]/page.tsx line ~102,
--    src/app/account/courses/[slug]/lessons/[lessonId]/page.tsx line
--    ~65) -- this is a pre-existing inconsistency in the codebase, not
--    something removed for this course, but it meant PayPal never showed
--    in those two spots because this column was left NULL when the
--    course was seeded. Reddit/Medium already have a real price_usd
--    value set (via /console/courses, the same admin field this uses),
--    which is why PayPal shows for them everywhere. ~₹999 at the
--    fallback conversion rate used elsewhere in the code (₹87.5/$1)
--    rounds to $11-12 -- set to $12, owner can fine-tune anytime via
--    /console/courses (Edit -> USD price), same as any course.

UPDATE course_modules
SET tier = 'pro'
WHERE course_id = (SELECT id FROM courses WHERE slug = 'build-deploy-your-own-ai-agency');

UPDATE courses
SET price_usd = 12
WHERE slug = 'build-deploy-your-own-ai-agency';
