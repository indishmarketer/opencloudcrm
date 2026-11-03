-- Durable workflow delays; the dispatcher resumes a run once this timestamp
-- is due instead of keeping an HTTP request open while it waits.
ALTER TABLE automation_workflow_runs
  ADD COLUMN IF NOT EXISTS wait_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_automation_workflow_runs_due
  ON automation_workflow_runs(wait_until, created_at, id)
  WHERE status = 'queued';
