-- Prevents duplicate payment_claims rows for the same gateway reference
-- (e.g. a double-clicked PayPal capture or a retried webhook creating two
-- claim records for one real payment). App-level dedup checks already exist
-- in the webhook/capture routes; this is the DB-level backstop.
--
-- Manual claims (method = 'manual') have no gateway reference, so the index
-- is partial (WHERE reference IS NOT NULL) -- those are unaffected.

-- Remove any existing duplicates first (keep the earliest row per
-- method+reference), or the unique index creation below would fail.
DELETE FROM payment_claims a
USING payment_claims b
WHERE a.id > b.id
  AND a.method = b.method
  AND a.reference = b.reference
  AND a.reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_claims_method_reference
  ON payment_claims(method, reference)
  WHERE reference IS NOT NULL;
