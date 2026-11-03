-- Free and paid directory listings.
--
-- Free means the submitter puts our badge on their own site and we check
-- for it; paid means they skip that. Both are reviewed by hand before they
-- go live, and the outbound link is nofollow either way, so this decides
-- the queue someone is in, not the SEO value they get.
ALTER TABLE directory_tools
  ADD COLUMN IF NOT EXISTS listing_tier text NOT NULL DEFAULT 'free';

ALTER TABLE directory_tools
  DROP CONSTRAINT IF EXISTS directory_tools_listing_tier_check;
ALTER TABLE directory_tools
  ADD CONSTRAINT directory_tools_listing_tier_check
  CHECK (listing_tier IN ('free', 'paid'));

-- The badge check. `backlink_checked_at` records that we looked, which is
-- what tells "never checked" apart from "checked and not found": without
-- it a failed check is indistinguishable from an untouched row.
ALTER TABLE directory_tools
  ADD COLUMN IF NOT EXISTS backlink_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS backlink_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS backlink_error text;

-- Paid listings: what was actually paid, so a refund or a dispute can be
-- traced back without reading the payment provider's dashboard.
ALTER TABLE directory_tools
  ADD COLUMN IF NOT EXISTS paid_amount_cents integer,
  ADD COLUMN IF NOT EXISTS paid_currency text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_reference text;

CREATE INDEX IF NOT EXISTS idx_directory_tools_awaiting_badge
  ON directory_tools (created_at DESC)
  WHERE listing_tier = 'free' AND backlink_verified_at IS NULL AND status = 'pending';
