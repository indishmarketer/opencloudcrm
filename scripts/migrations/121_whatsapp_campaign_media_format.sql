-- The media type a campaign's template header carries.
--
-- Without it, a campaign whose template has (say) an image header could
-- only be sent when `whatsapp_template_media` happened to hold a row for
-- that template: the send builder reads the type from there to decide
-- whether to pass the file as image, video or document. A campaign given
-- its own one-off media URL had no type at all, so the header parameter
-- was dropped and Meta rejected every message in it.
--
-- The format comes from the template at the moment the campaign is
-- created, which is also the moment the URL is chosen, so the two always
-- agree.
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS header_media_format TEXT
  CHECK (header_media_format IS NULL OR header_media_format IN ('IMAGE', 'VIDEO', 'DOCUMENT'));
