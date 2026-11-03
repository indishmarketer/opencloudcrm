-- Hide deleted workflows while retaining their run history for recovery.
ALTER TABLE automation_workflows
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_automation_workflows_visible
  ON automation_workflows(updated_at DESC, id DESC)
  WHERE archived_at IS NULL;
