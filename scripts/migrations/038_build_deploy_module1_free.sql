-- Owner request (2026-08-23): "Build & Deploy Your Own AI Agency" goes back
-- to a free+PRO split instead of fully PRO (035_build_deploy_pro_and_usd_price.sql
-- made every module 'pro'). Only Module 1 ("Foundations") becomes free again;
-- Modules 2-10 stay 'pro'. This also means the /courses listing page's
-- FREE/PRO badge logic needs to show BOTH badges for this course now (see
-- accompanying src/app/courses/page.tsx change) -- same as how "Medium
-- Writing & Monetization Challenge" already displays both badges.

UPDATE course_modules
SET tier = 'free'
WHERE course_id = (SELECT id FROM courses WHERE slug = 'build-deploy-your-own-ai-agency')
  AND position = 1;
