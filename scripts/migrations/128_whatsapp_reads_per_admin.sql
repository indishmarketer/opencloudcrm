-- Unread counts are per admin, not per console. With invited admins, the
-- single-row-per-conversation version meant whoever opened a chat first
-- cleared its badge for everyone else.
--
-- Recreated rather than altered: the old rows carry no admin and are one
-- day old. Every conversation reads as unread once, which costs a click.
--
-- RUN IMMEDIATELY AFTER the deploy that ships the per-admin code: the old
-- code upserts ON CONFLICT (conversation_key), which this removes.
DROP TABLE IF EXISTS whatsapp_conversation_reads;

CREATE TABLE whatsapp_conversation_reads (
  conversation_key TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_key, admin_email)
);
