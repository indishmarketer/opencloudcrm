-- A template can belong to more than one group (a booking reminder is both
-- "Bookings" and "Reminders"), which the single-label table could not hold.
-- Membership rows, keyed on the template name because that is what every
-- send refers to and a name cannot change after creation.
--
-- The old whatsapp_template_labels table is left in place here and dropped
-- in 125, after the deploy: running this one first means the new code finds
-- its table already populated.
CREATE TABLE IF NOT EXISTS whatsapp_template_groups (
  template_name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (template_name, group_name)
);

CREATE INDEX IF NOT EXISTS whatsapp_template_groups_group_idx
  ON whatsapp_template_groups (group_name);

INSERT INTO whatsapp_template_groups (template_name, group_name)
SELECT template_name, label FROM whatsapp_template_labels
ON CONFLICT DO NOTHING;
