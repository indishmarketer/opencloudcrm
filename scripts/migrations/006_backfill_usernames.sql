-- Backfill usernames for accounts created before signup auto-generated one.
-- Safe to re-run: only touches rows where username IS NULL.

DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  FOR r IN SELECT id, email, name FROM users WHERE username IS NULL LOOP
    base := lower(regexp_replace(coalesce(r.name, split_part(r.email, '@', 1)), '[^a-zA-Z0-9]+', '-', 'g'));
    base := trim(both '-' from base);
    base := left(base, 24);
    IF base = '' THEN
      base := 'member';
    END IF;

    candidate := base;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM users WHERE username = candidate) LOOP
      suffix := suffix + 1;
      candidate := base || '-' || suffix;
    END LOOP;

    UPDATE users SET username = candidate WHERE id = r.id;
  END LOOP;
END $$;
