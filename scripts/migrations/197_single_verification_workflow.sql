-- A verification request contains a one-time credential. One active
-- workflow avoids sending duplicate codes to the same requester.
CREATE UNIQUE INDEX IF NOT EXISTS automation_one_active_verification_workflow
  ON automation_workflows (trigger_key)
  WHERE status = 'active' AND archived_at IS NULL
    AND trigger_type = 'event' AND trigger_key = 'contact.verification_requested';
