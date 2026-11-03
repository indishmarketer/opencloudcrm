-- Review requests marked 'failed' permanently on the very first transient
-- error (a Brevo blip, quota exhaustion), unlike every other send queue in
-- the system (campaigns, automation), which retries up to 5 times first.
ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
