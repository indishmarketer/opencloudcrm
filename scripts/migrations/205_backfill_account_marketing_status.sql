-- Account signup is a code-owned opt-in. Keep unverified accounts in an
-- honest pending state and align already-verified historical accounts with
-- their users.updates_opt_in value. Never overwrite a deliberate unsubscribe
-- or a deliverability problem.
UPDATE contacts c
SET marketing_status = 'subscribed', updated_at = now()
FROM users u
WHERE c.user_id = u.id
  AND u.updates_opt_in = true
  AND u.email_verified_at IS NOT NULL
  AND c.marketing_status IN ('unknown', 'pending')
  AND c.deliverability_status = 'ok';

UPDATE contacts c
SET marketing_status = 'pending', updated_at = now()
FROM users u
WHERE c.user_id = u.id
  AND u.updates_opt_in = true
  AND u.email_verified_at IS NULL
  AND c.marketing_status = 'unknown';
