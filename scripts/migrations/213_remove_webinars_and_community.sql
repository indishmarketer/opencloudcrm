-- Remove the webinar and community features entirely.
--
-- Both were already dark to the public: /webinars and /community answered
-- 410 Gone from retiredFeatures.ts. This drops the storage behind them now
-- that the routes, console screens, libraries and components are gone too.
--
-- What is deliberately NOT dropped, because it does not belong to either
-- feature even though it shares their history:
--
--   blog_comments      created by the community migrations (002-005) but
--                      it is the blog's own comment thread, still live.
--   meeting_bookings   created by 048_meetings_and_webinars.sql alongside
--   meeting_types      the webinar tables. Meetings is a live feature with
--   meeting_reminders  real bookings in it.
--
-- The old migration files are left in place as history. Deleting them
-- would not drop anything from a database that has already run them, and
-- 048 in particular is load-bearing for meetings.
--
-- Columns on `users` are also left alone. username, avatar_url, bio, role
-- and social_links arrived with the forum but are now used by comments,
-- moderation and the author box, and every account has a username.
-- community_points stays as a harmless dead column rather than risk a
-- rewrite of the users table for nothing; nothing reads or writes it now.
--
-- Row counts immediately before this ran: forum_posts 0, forum_comments 0,
-- forum_post_likes 0, direct_messages 0, community_bans 0,
-- community_invites 0, community_memberships 0, community_categories 5
-- (seed), community_settings 2 (seed), webinars 1, webinar_schedules 1,
-- webinar_timed_events 2, webinar_attendance_archive 1, everything else 0.

BEGIN;

-- Child tables first where a foreign key would otherwise block the drop.
-- CASCADE covers views, constraints and any index left pointing at these.
DROP TABLE IF EXISTS webinar_comments CASCADE;
DROP TABLE IF EXISTS webinar_reminders CASCADE;
DROP TABLE IF EXISTS webinar_timed_events CASCADE;
DROP TABLE IF EXISTS webinar_event_responses CASCADE;
DROP TABLE IF EXISTS webinar_quiz_responses CASCADE;
DROP TABLE IF EXISTS webinar_attendance_archive CASCADE;
DROP TABLE IF EXISTS webinar_access CASCADE;
DROP TABLE IF EXISTS webinar_schedules CASCADE;
DROP TABLE IF EXISTS webinars CASCADE;

DROP TABLE IF EXISTS forum_post_likes CASCADE;
DROP TABLE IF EXISTS forum_comments CASCADE;
DROP TABLE IF EXISTS forum_posts CASCADE;
DROP TABLE IF EXISTS direct_messages CASCADE;
DROP TABLE IF EXISTS community_invites CASCADE;
DROP TABLE IF EXISTS community_bans CASCADE;
DROP TABLE IF EXISTS community_memberships CASCADE;
DROP TABLE IF EXISTS community_categories CASCADE;
DROP TABLE IF EXISTS community_settings CASCADE;

-- Automation that pointed at the forum. The trigger key and the exit goal
-- both disappeared from the code, so any flow still carrying them would
-- sit active forever without ever matching anything.
--
-- Archived rather than deleted: email_flow_steps and email_flow_runs
-- reference these rows, and the owner should still be able to see that a
-- journey existed. Guarded on the column actually being there so this
-- stays safe on a deployment whose email_flows predates either column.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'email_flows' AND column_name = 'trigger_key')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'email_flows' AND column_name = 'archived_at') THEN
    UPDATE email_flows
       SET active = false, archived_at = COALESCE(archived_at, now())
     WHERE trigger_key = 'community_inactivity';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'email_flows' AND column_name = 'goal_type') THEN
    UPDATE email_flows SET goal_type = 'none' WHERE goal_type = 'community_first_post';
  END IF;
END $$;

COMMIT;
