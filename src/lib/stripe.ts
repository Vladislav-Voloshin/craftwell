import Stripe from "stripe";

// ---------------------------------------------------------------------------
// Pricing catalogue
// ---------------------------------------------------------------------------

/** Stripe Price IDs are set per-environment via env vars. */
export const PLANS = {
  monthly: {
    priceId: () => requireEnv("STRIPE_PRICE_MONTHLY"),
    amount: 1299, // cents
    currency: "usd",
    interval: "month" as const,
    mode: "subscription" as const,
  },
  annual: {
    priceId: () => requireEnv("STRIPE_PRICE_ANNUAL"),
    amount: 9900,
    currency: "usd",
    interval: "year" as const,
    mode: "subscription" as const,
  },
  lifetime: {
    priceId: () => requireEnv("STRIPE_PRICE_LIFETIME"),
    amount: 14900,
    currency: "usd",
    interval: null,
    mode: "payment" as const,
    /** Hard cap on lifetime purchases. Enforced at checkout creation time. */
    purchaseCap: 500,
  },
} as const;

export type PlanType = keyof typeof PLANS;

// ---------------------------------------------------------------------------
// Stripe singleton
// ---------------------------------------------------------------------------

let _stripe: Stripe | undefined;

/**
 * Returns a memoised Stripe client.
 * Throws at call-time (not module load) so missing keys only fail routes
 * that actually use Stripe, not the entire Next.js process.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = requireEnv("STRIPE_SECRET_KEY");
    // `apiVersion` is required by the Stripe TypeScript SDK.
    // Keep this in sync with your Stripe dashboard webhook version.
    _stripe = new Stripe(key, {
      // @ts-expect-error — apiVersion literal differs between SDK patch releases.
      // The string must match your Stripe account API version.
      apiVersion: "2025-03-31.basil",
      typescript: true,
    });
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Webhook helpers
// ---------------------------------------------------------------------------

/**
 * Verify and parse a Stripe webhook event from a raw request body.
 * Throws if the signature is invalid.
 */
export function constructWebhookEvent(
  rawBody: string,
  signature: string
): Stripe.Event {
  const secret = requireEnv("STRIPE_WEBHOOK_SECRET");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

/** Reset the cached Stripe instance — for tests only. */
export function _resetStripeForTests(): void {
  _stripe = undefined;
}
