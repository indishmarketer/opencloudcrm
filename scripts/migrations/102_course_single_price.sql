-- One price per course, in the currency the owner chooses (INR or USD).
-- The other currency is converted live at display and charge time
-- (src/lib/currency.ts): Razorpay charges INR, PayPal charges USD.
-- Run BEFORE deploying the code that reads courses.price; the old columns
-- are dropped by 103 after the deploy.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS price INTEGER;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS price_currency TEXT NOT NULL DEFAULT 'INR';
DO $$ BEGIN
  ALTER TABLE courses ADD CONSTRAINT courses_price_currency_check CHECK (price_currency IN ('INR', 'USD'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE courses SET price = price_inr, price_currency = 'INR' WHERE price IS NULL AND price_inr IS NOT NULL;
