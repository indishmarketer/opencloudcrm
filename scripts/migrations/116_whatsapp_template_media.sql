-- Default header media for a WhatsApp template.
--
-- Meta stores only the sample a template was reviewed against, and never
-- returns it: every send of a media template has to supply its own file by
-- public URL. Without somewhere to remember that URL, each send (including
-- automated ones) would need the media pasted in by hand. The file itself
-- lives in R2; this is just the pointer, keyed by template name because
-- that is what the sending code refers to.
CREATE TABLE IF NOT EXISTS whatsapp_template_media (
  template_name TEXT PRIMARY KEY,
  media_url TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('IMAGE', 'VIDEO', 'DOCUMENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
