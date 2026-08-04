-- ---------------------------------------------------------------------------
-- 010_subscriptions.sql
-- Stripe subscription records — one row per user, updated on webhook events.
-- ---------------------------------------------------------------------------

CREATE TABLE public.subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Stripe identifiers
  stripe_customer_id      TEXT        NOT NULL,
  stripe_subscription_id  TEXT,                          -- NULL for lifetime (one-time payment)
  stripe_price_id         TEXT        NOT NULL,

  -- Plan & status
  plan_type               TEXT        NOT NULL CHECK (plan_type IN ('monthly', 'annual', 'lifetime')),
  status                  TEXT        NOT NULL CHECK (
                                        status IN (
                                          'active', 'canceled', 'past_due',
                                          'trialing', 'incomplete',
                                          'incomplete_expired', 'paused'
                                        )
                                      ),

  -- Billing period (NULL for lifetime one-time payments)
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,

  -- Cancellation tracking
  cancel_at_period_end    BOOLEAN     NOT NULL DEFAULT FALSE,
  canceled_at             TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One subscription record per user
  UNIQUE (user_id)
);

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index for Stripe webhook lookups (stripe_customer_id, stripe_subscription_id)
CREATE INDEX subscriptions_stripe_customer_id_idx
  ON public.subscriptions (stripe_customer_id);

CREATE INDEX subscriptions_stripe_subscription_id_idx
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscription
CREATE POLICY "subscriptions: users read own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only the service role (used by API routes / webhooks) can write
CREATE POLICY "subscriptions: service role full access"
  ON public.subscriptions FOR ALL
  USING    (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
