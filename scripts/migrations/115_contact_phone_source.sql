-- Tracks where a contact's phone number came from, mirroring country_source
-- (see migration 071 for the phone column itself, 105 for the country_source
-- precedent). Lets a deliberate self-entered number win over a weaker guess
-- without a self-entered one ever being silently overwritten by one.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_source TEXT
  CHECK (phone_source IN ('form', 'self', 'owner', 'razorpay', 'paypal'));
