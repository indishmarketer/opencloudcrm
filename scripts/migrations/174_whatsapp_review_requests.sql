BEGIN;

ALTER TABLE review_requests
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email','whatsapp')),
  ADD COLUMN IF NOT EXISTS whatsapp_template_key TEXT;

-- Preserve the known system-template wiring for the WhatsApp review request
-- as editable template defaults: the contact's first name and the official
-- Google review link, mirroring the fixed email template's two variables.
INSERT INTO whatsapp_template_variable_mappings (template_name, variable_position, source_key)
VALUES
  ('customer_review_request', 1, 'contact.first_name'),
  ('customer_review_request', 2, 'review.google_review_url')
ON CONFLICT (template_name, variable_position) DO NOTHING;

COMMIT;
