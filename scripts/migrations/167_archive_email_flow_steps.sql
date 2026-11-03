-- Keep removed email journey nodes in place for delivery history while
-- excluding them from future schedules and sends.
ALTER TABLE email_flow_steps
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_flow_steps_active
  ON email_flow_steps(flow_id, position, id)
  WHERE archived_at IS NULL;
