-- ---------------------------------------------------------------------------
-- 011_entitlements_provider.sql
-- Make `subscriptions` provider-agnostic so Apple In-App Purchase and Google
-- Play Billing can write to the SAME entitlement source of truth as Stripe.
--
-- iOS App Store (Guideline 3.1.1) requires in-app digital subscriptions to use
-- Apple IAP, so the iOS purchase path cannot be Stripe. Rather than fork the
-- data model per platform, every provider upserts one row per user here and the
-- app reads entitlement through a single helper (src/lib/entitlements.ts).
--
-- Backward compatible: existing rows default to provider='stripe'. Additive
-- columns + relaxed NOT NULLs only — no data migration required.
-- ---------------------------------------------------------------------------

-- 1. Which payment provider issued this entitlement.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'stripe'
    CHECK (provider IN ('stripe', 'apple', 'google'));

-- 2. Generic provider references for non-Stripe rows.
--    provider_product_id     = Apple product id / Google SKU
--    provider_transaction_id = Apple original_transaction_id / Google purchaseToken
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_product_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT;

-- 3. Stripe-specific columns are no longer mandatory — Apple/Google rows
--    will not have a Stripe customer or price.
ALTER TABLE public.subscriptions ALTER COLUMN stripe_customer_id DROP NOT NULL;
ALTER TABLE public.subscriptions ALTER COLUMN stripe_price_id    DROP NOT NULL;

-- 4. Fast lookups for IAP server notifications keyed by provider transaction.
CREATE INDEX IF NOT EXISTS subscriptions_provider_txn_idx
  ON public.subscriptions (provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

-- RLS policies and the updated_at trigger from 010 are unchanged and still apply.
