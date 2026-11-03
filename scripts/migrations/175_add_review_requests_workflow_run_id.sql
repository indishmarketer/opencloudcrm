BEGIN;

-- 173 added automation_workflow_id and automation_workflow_node_id but the
-- review-request queue/dispatch code (queueGoogleReviewRequest) also writes
-- automation_workflow_run_id, which was never created. Add the missing
-- column so review requests can be queued again.
ALTER TABLE review_requests
  ADD COLUMN IF NOT EXISTS automation_workflow_run_id BIGINT REFERENCES automation_workflow_runs(id) ON DELETE SET NULL;

COMMIT;
