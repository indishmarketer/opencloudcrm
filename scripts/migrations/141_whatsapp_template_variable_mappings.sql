BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_template_variable_mappings (
  template_name TEXT NOT NULL,
  variable_position INTEGER NOT NULL CHECK (variable_position > 0),
  source_key TEXT NOT NULL,
  fixed_value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (template_name, variable_position)
);

-- Preserve the known system-template wiring as editable template defaults.
INSERT INTO whatsapp_template_variable_mappings (template_name, variable_position, source_key)
VALUES
  ('booking_confirmation', 1, 'contact.first_name'),
  ('booking_confirmation', 2, 'booking.meeting_name'),
  ('booking_confirmation', 3, 'booking.scheduled_datetime'),
  ('booking_confirmation', 4, 'booking.join_link'),
  ('purchase_confirmation', 1, 'contact.first_name'),
  ('purchase_confirmation', 2, 'purchase.course_title'),
  ('purchase_confirmation', 3, 'purchase.access_link')
ON CONFLICT (template_name, variable_position) DO NOTHING;

COMMIT;
