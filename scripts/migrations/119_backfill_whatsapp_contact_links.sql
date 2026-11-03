-- Links WhatsApp messages recorded before contact_id existed (migration
-- 118) to their contact, so existing conversations appear on the contact
-- record instead of only the ones sent from now on.
--
-- Matches on digits only, because a number can be stored with a +, spaces
-- or dashes depending on whether it came from our own form, a payment
-- gateway or an import. Exact digit match only -- the looser last-10-digit
-- fallback used at write time is deliberately not applied in bulk here,
-- where a wrong guess would be silent and permanent.
UPDATE whatsapp_messages m
SET contact_id = c.id
FROM contacts c
WHERE m.contact_id IS NULL
  AND c.phone IS NOT NULL
  AND regexp_replace(COALESCE(m.from_number, m.to_number), '\D', '', 'g') = regexp_replace(c.phone, '\D', '', 'g')
  AND regexp_replace(c.phone, '\D', '', 'g') <> '';
