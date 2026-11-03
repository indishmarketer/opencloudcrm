-- Paid directory listings are approved before payment, then published only
-- after the provider confirms the fixed $5 listing charge.
ALTER TABLE directory_tools DROP CONSTRAINT IF EXISTS directory_tools_status_check;
ALTER TABLE directory_tools ADD CONSTRAINT directory_tools_status_check
  CHECK (status IN ('draft', 'pending', 'changes_requested', 'approved_unpaid', 'published', 'rejected'));

CREATE TABLE IF NOT EXISTS directory_listing_orders (
  id bigserial PRIMARY KEY,
  tool_id integer NOT NULL REFERENCES directory_tools(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('razorpay', 'paypal')),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency IN ('INR', 'USD')),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'expired')),
  provider_order_id text,
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_listing_orders_provider_order
  ON directory_listing_orders (provider, provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_listing_orders_payment_reference
  ON directory_listing_orders (provider, payment_reference) WHERE payment_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_listing_orders_one_open
  ON directory_listing_orders (tool_id, provider) WHERE status = 'created';
CREATE INDEX IF NOT EXISTS idx_directory_listing_orders_user
  ON directory_listing_orders (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blog_draft_notification_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  initialized boolean NOT NULL DEFAULT false
);
INSERT INTO blog_draft_notification_state (id, initialized) VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS blog_draft_notifications (
  slug text PRIMARY KEY,
  first_seen_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO email_templates
  (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars)
VALUES
  ('account-email-change', 'security', 'Confirm account email change',
   'Sent to the new address when a member asks to change their account email.',
   $s$Confirm your new Indish Marketer email address$s$,
   $b$<p>You asked to use this address for your Indish Marketer account.</p><p><a href="{{confirm_url}}">Confirm this email address</a></p><p>The link works for one hour. Until you open it, your account keeps using {{current_email}}.</p><p>If you did not ask for this, ignore this email and nothing changes.</p>$b$,
   'support@example.com', true, false, ARRAY['confirm_url','current_email']),
  ('tool-submission-approved-payment', 'community-support', 'Tool approved, payment needed',
   'Sent when a paid tool listing passes review and is ready for its one-time listing payment.',
   $s${{tool_name}} is approved. Complete your listing payment$s$,
   $b$<p>Good news. We approved <strong>{{tool_name}}</strong> for the Indish Marketer directory.</p><p>Complete the one-time $5 listing payment to publish it:</p><p><a href="{{payment_url}}">Pay for your listing</a></p><p>Your listing will go live after the payment is confirmed.</p><p>Indish Marketer</p>$b$,
   'support@example.com', false, true, ARRAY['tool_name','payment_url'])
ON CONFLICT (key) DO NOTHING;
