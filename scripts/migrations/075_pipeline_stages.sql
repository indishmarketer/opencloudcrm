BEGIN;

-- Manual (GoHighLevel-style) pipeline: admin-defined stages, contacts
-- manually dragged between them. Replaces the earlier auto-computed
-- lead/signed_up/engaged/customer funnel entirely -- that was confusing
-- (two labels for what felt like the same thing) and gave no way to track
-- an actual in-progress conversation. The only automatic behavior kept is
-- assigning a brand new contact to whichever stage is marked is_default;
-- every movement after that is a manual drag on the board.

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_default_pipeline_stage
  ON pipeline_stages ((true)) WHERE is_default = true;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pipeline_stage_id INTEGER
  REFERENCES pipeline_stages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_pipeline_stage ON contacts(pipeline_stage_id);

INSERT INTO pipeline_stages (name, position, is_default)
SELECT * FROM (VALUES
  ('New Lead', 0, true),
  ('Contacted', 1, false),
  ('In Conversation', 2, false),
  ('Customer', 3, false),
  ('Lost', 4, false)
) AS seed(name, position, is_default)
WHERE NOT EXISTS (SELECT 1 FROM pipeline_stages);

-- Backfill every existing contact into New Lead, except contacts who
-- already have an approved payment -- start those in Customer instead so
-- existing paying customers don't all need re-dragging by hand on day one.
UPDATE contacts SET pipeline_stage_id = (SELECT id FROM pipeline_stages WHERE is_default = true LIMIT 1)
WHERE pipeline_stage_id IS NULL;

UPDATE contacts c SET pipeline_stage_id = (SELECT id FROM pipeline_stages WHERE name = 'Customer' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM payment_claims pc WHERE pc.user_id = c.user_id AND pc.status = 'approved');

COMMIT;
