-- Needs attention becomes a real notification list.
--
-- Two states, not one. Opening an alert marks it viewed so the unread
-- count drops and the owner can tell what he has already looked at, but
-- viewed is explicitly not done: a submitted tool is still waiting for a
-- decision after he has read the line. Only resolved_at means handled.
ALTER TABLE system_alerts ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

-- The console header reads this count on every page load, so it gets its
-- own partial index rather than scanning open alerts each time.
CREATE INDEX IF NOT EXISTS idx_system_alerts_unviewed
  ON system_alerts (created_at DESC)
  WHERE resolved_at IS NULL AND viewed_at IS NULL;
