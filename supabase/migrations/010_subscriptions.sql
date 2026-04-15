-- Subscription management schema for Stripe integration.
-- Stores subscription status alongside the user profile.

-- Add subscription fields to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'free'
    CHECK (subscription_status IN ('free', 'active', 'canceled', 'past_due', 'trialing', 'lifetime')),
  ADD COLUMN IF NOT EXISTS subscription_plan text
    CHECK (subscription_plan IN ('monthly', 'yearly', 'lifetime', NULL)),
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_stripe_id text;

-- Index for quick subscription lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON public.users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON public.users(subscription_status);

-- Subscription events audit log
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  subscription_status text,
  plan text,
  amount_cents integer,
  currency text DEFAULT 'usd',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Only the service role can insert events (from webhook)
-- Users can read their own events
CREATE POLICY "Users can read own subscription events"
  ON public.subscription_events
  FOR SELECT
  USING (auth.uid() = user_id);
