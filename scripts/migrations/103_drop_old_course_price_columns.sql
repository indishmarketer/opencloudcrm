-- Run AFTER the single-price code (102) is deployed. Razorpay now uses
-- Standard Checkout with API keys, so the Payment Button id is unused, and
-- price_inr / price_usd are replaced by price + price_currency.
ALTER TABLE courses DROP COLUMN IF EXISTS razorpay_button_id;
ALTER TABLE courses DROP COLUMN IF EXISTS price_inr;
ALTER TABLE courses DROP COLUMN IF EXISTS price_usd;
