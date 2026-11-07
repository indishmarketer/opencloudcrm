-- The original base schema. Everything in this repo's migration history
-- (002 onward) was captured starting from an already-running database --
-- these core tables were created before migration tracking existed at
-- all, so no .sql file for them ever made it into this repo. That's
-- invisible on an existing, already-migrated database (this file's
-- CREATE TABLE IF NOT EXISTS statements just no-op there), but it means
-- a genuinely fresh database -- anyone deploying this public repo from
-- scratch -- fails on the very first migration (002 ALTERs `users`,
-- which nothing had created yet).
--
-- Reconstructed directly from the live production schema (every column,
-- type, default, constraint and index below matches it exactly), with
-- one deliberate exception: columns whose foreign key points at a table
-- that a *later* migration creates (newsletter_campaigns.segment_id ->
-- contact_segments, newsletter_sends.contact_id/email_delivery_id ->
-- contacts/email_deliveries, all from migration 042) are left out here
-- and picked up by that migration's own `ADD COLUMN IF NOT EXISTS`, same
-- as it already does today -- creating them here would fail on a fresh
-- database since those target tables don't exist yet at this point in
-- the sequence. Every other column is safe to create now regardless of
-- when it was historically added, since every later migration that also
-- touches these tables already uses `ADD COLUMN IF NOT EXISTS` /
-- `CREATE TABLE IF NOT EXISTS` throughout -- it simply finds the work
-- already done.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  interested_in TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator')),
  username TEXT UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ,
  community_points INTEGER NOT NULL DEFAULT 0,
  email_verified_at TIMESTAMPTZ,
  session_version INTEGER NOT NULL DEFAULT 1,
  referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  updates_opt_in BOOLEAN NOT NULL DEFAULT false,
  whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  cover_image_url TEXT,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  price INTEGER,
  price_currency TEXT NOT NULL DEFAULT 'INR' CHECK (price_currency IN ('INR', 'USD')),
  -- Retired, pre-unified-price columns -- dropped by migration 103, but
  -- migrations 035/043/045/102 read or write them before that point, so
  -- (unlike every other column this file leaves out) they have to exist
  -- here too, not just be left for a later ADD COLUMN that never comes.
  price_inr INTEGER,
  price_usd NUMERIC(10, 2)
);

CREATE TABLE IF NOT EXISTS course_modules (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'pro')),
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_course_modules_course ON course_modules(course_id);

CREATE TABLE IF NOT EXISTS course_lessons (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_type TEXT NOT NULL CHECK (video_type IN ('youtube', 'r2')),
  video_ref TEXT,
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_course_lessons_module ON course_lessons(module_id);

CREATE TABLE IF NOT EXISTS course_enrollments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'pro')),
  granted_via TEXT NOT NULL,
  nudged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course ON course_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_user ON course_enrollments(user_id);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON lesson_progress(user_id);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  unsubscribed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_user ON newsletter_subscribers(user_id);

-- segment_id intentionally omitted -- see the file header. Migration 042
-- adds it once contact_segments exists.
CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id SERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  audience TEXT NOT NULL DEFAULT 'all',
  from_email TEXT NOT NULL DEFAULT 'hello@example.com',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  last_error TEXT,
  source_post_slug TEXT,
  scheduled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_scheduled ON newsletter_campaigns(scheduled_at) WHERE status = 'scheduled';

-- contact_id / email_delivery_id intentionally omitted -- see the file
-- header. Migration 042 adds them once contacts/email_deliveries exist.
CREATE TABLE IF NOT EXISTS newsletter_sends (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
  subscriber_id INTEGER REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  open_count INTEGER NOT NULL DEFAULT 0,
  clicked_at TIMESTAMPTZ,
  click_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  claimed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  skipped_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_newsletter_sends_campaign ON newsletter_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_sends_pending ON newsletter_sends(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_newsletter_sends_subscriber ON newsletter_sends(subscriber_id);

CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  link_token TEXT,
  payload JSONB
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_codes_link_token ON otp_codes(link_token) WHERE link_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_claims (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  amount NUMERIC(12, 2),
  currency TEXT,
  refunded_at TIMESTAMPTZ,
  refund_amount NUMERIC(12, 2),
  disputed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_claims_method_reference ON payment_claims(method, reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_claims_status ON payment_claims(status);

CREATE TABLE IF NOT EXISTS review_submissions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  website TEXT,
  rating INTEGER NOT NULL DEFAULT 5,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id INTEGER REFERENCES users(id),
  admin_note TEXT,
  screenshots TEXT[] NOT NULL DEFAULT '{}',
  youtube_id TEXT,
  source TEXT NOT NULL DEFAULT 'WEBSITE' CHECK (source = 'WEBSITE')
);
CREATE INDEX IF NOT EXISTS idx_review_submissions_user ON review_submissions(user_id);

CREATE TABLE IF NOT EXISTS contact_submissions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  replied_at TIMESTAMPTZ,
  reply_text TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_email ON contact_submissions(email);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_user ON contact_submissions(user_id);

CREATE TABLE IF NOT EXISTS product_leads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  product TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indexed_urls (
  url TEXT PRIMARY KEY,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
