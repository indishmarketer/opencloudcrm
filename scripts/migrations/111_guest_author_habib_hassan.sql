-- This migration used to seed a real third-party guest author bio tied to a
-- specific blog post that was never part of the committed seed data (see
-- 144_blog_posts.sql's comment) -- so on a fresh install it was an orphaned
-- row with no matching post, just clutter in a generic deployment's author
-- list. Intentionally a no-op now; kept as a file so the migration numbering
-- stays stable for installs that already ran it.
SELECT 1;
