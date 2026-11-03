BEGIN;

-- "Contacted" and "In Conversation" read as the same stage to the owner --
-- collapse to one. Safe as a straight delete: nothing was in "In
-- Conversation" yet (checked before writing this), and the DELETE route
-- already reassigns any contacts in a deleted stage to the default stage
-- as a safety net if that assumption ever turns out wrong on replay.
UPDATE contacts SET pipeline_stage_id = (SELECT id FROM pipeline_stages WHERE is_default = true LIMIT 1)
  WHERE pipeline_stage_id = (SELECT id FROM pipeline_stages WHERE name = 'In Conversation');
DELETE FROM pipeline_stages WHERE name = 'In Conversation';

-- Close the position gap left behind.
UPDATE pipeline_stages SET position = position - 1 WHERE position > (SELECT position FROM pipeline_stages WHERE name = 'Contacted');

COMMIT;
