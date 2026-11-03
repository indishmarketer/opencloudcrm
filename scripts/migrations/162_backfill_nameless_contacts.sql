-- Backfills contacts.name for rows stuck at NULL because the contact row
-- was first created as a side effect of sending a verification-code email
-- (OTP flows for the contact form / guide downloads: sendEmail ->
-- ensureContact with no name) before the person ever finished verifying,
-- so the name they actually typed never made it onto the contacts row.
-- Only ever fills a NULL -- never overwrites an existing name.

-- Source 1: otp_codes.payload carries the name captured at request time
-- for the 'contact' and 'guide' purposes (see src/app/api/contact/
-- request-otp/route.ts and src/app/api/guide/request/route.ts).
WITH latest_otp AS (
  SELECT DISTINCT ON (lower(trim(email)))
    lower(trim(email)) AS normalized_email,
    payload->>'name' AS name
  FROM otp_codes
  WHERE purpose IN ('contact', 'guide')
    AND payload->>'name' IS NOT NULL
    AND trim(payload->>'name') <> ''
  ORDER BY lower(trim(email)), created_at DESC
)
UPDATE contacts c
SET name = latest_otp.name, updated_at = now()
FROM latest_otp
WHERE c.normalized_email = latest_otp.normalized_email
  AND c.name IS NULL;

-- Source 2: newsletter_subscribers.name, as a safety net -- the
-- trg_sync_newsletter_contact trigger (migration 042) already syncs this
-- on every insert/update, so this should normally be a no-op, but covers
-- any row that predates that trigger or slipped through some other way.
UPDATE contacts c
SET name = ns.name, updated_at = now()
FROM newsletter_subscribers ns
WHERE c.normalized_email = lower(trim(ns.email))
  AND c.name IS NULL
  AND ns.name IS NOT NULL
  AND trim(ns.name) <> '';
