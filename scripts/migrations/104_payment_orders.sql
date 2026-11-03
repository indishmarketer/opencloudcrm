-- One row per checkout order created with Razorpay or PayPal. It is the
-- durable link between a provider order and the buyer/course/amount, so a
-- webhook that arrives days late (after the 2h signed token has expired)
-- can still grant access, and repeat clicks reuse a pending order instead
-- of creating new ones.
CREATE TABLE IF NOT EXISTS payment_orders (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('razorpay', 'paypal')),
  provider_order_id TEXT,
  idempotency_key UUID NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency IN ('INR', 'USD')),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid')),
  payment_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_provider_order
  ON payment_orders (provider, provider_order_id) WHERE provider_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_orders_pending
  ON payment_orders (user_id, course_id, provider, created_at DESC) WHERE status = 'created';
