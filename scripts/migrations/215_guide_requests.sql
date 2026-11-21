-- The free guide no longer asks for an OTP. The request itself is enough to
-- send the document, and clicking the link in that email is what proves the
-- inbox is real. Each request gets its own permanent token so that proof can
-- arrive whenever the person actually opens their mail. Deliberately no
-- expiry and no single-use flag: an expiring link would throw away the
-- signal (and the lead) from anyone who reads their email a day later.
CREATE TABLE IF NOT EXISTS guide_requests (
  id serial PRIMARY KEY,
  token text NOT NULL UNIQUE,
  guide_id integer NOT NULL REFERENCES guide_documents(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  phone text,
  country text,
  created_at timestamptz NOT NULL DEFAULT now(),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_guide_requests_email ON guide_requests (lower(email));
CREATE INDEX IF NOT EXISTS idx_guide_requests_guide ON guide_requests (guide_id);

-- Finding everyone who asked but never opened is the whole point of keeping
-- first_opened_at nullable, so make that lookup cheap.
CREATE INDEX IF NOT EXISTS idx_guide_requests_unopened
  ON guide_requests (created_at DESC)
  WHERE first_opened_at IS NULL;
