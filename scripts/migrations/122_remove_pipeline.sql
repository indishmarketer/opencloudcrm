-- Removes the sales pipeline entirely (owner's decision, 2026-10-22: it was
-- never used, and an unused board on the contacts screen is worse than no
-- board -- every contact showed a stage that meant nothing).
--
-- This is deliberately destructive: which stage each contact sat in is not
-- kept anywhere else, so it goes with the column. The nightly database
-- backup is the only copy from here on.
--
-- The stage-change entries already written to contact_activities are left
-- alone. They are a record of something that actually happened, and the
-- timeline renders them from their own stored text without needing the
-- pipeline tables to exist.
ALTER TABLE contacts DROP COLUMN IF EXISTS pipeline_stage_id;
DROP TABLE IF EXISTS pipeline_stages;
