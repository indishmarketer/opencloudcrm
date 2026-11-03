-- Free-guide lead magnet: homepage popup -> email magic-link verification
-- -> download page. "guide" joins contacts.source's existing allowed
-- values (synced/manual/import).
ALTER TABLE contacts DROP CONSTRAINT contacts_source_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_source_check
  CHECK (source = ANY (ARRAY['synced', 'manual', 'import', 'guide']));

-- Named lead_magnets, not "guides" -- the prompt library already has an
-- unrelated "guides" concept (written how-to articles with inline body
-- images), and the console nav label ("Free Guides") would otherwise
-- collide with that in the owner's head.
CREATE TABLE lead_magnets (
  id serial PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  headline text NOT NULL,
  subheadline text,
  cover_image_url text,
  file_url text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Every lead magnet request and (separately) every confirmed download is
-- an idempotent contact_activities row via recordContactActivity(), keyed
-- on (source, source_record_id, activity_type) -- no new table needed for
-- that bookkeeping.
