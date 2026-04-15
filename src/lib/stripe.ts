import Stripe from "stripe";

let _stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/** Plan configuration — prices are set in Stripe Dashboard, IDs stored in env. */
export const PLANS = {
  monthly: {
    name: "Pro Monthly",
    priceId: process.env.STRIPE_PRICE_MONTHLY || "",
    amount: 1299, // $12.99
    interval: "month" as const,
  },
  yearly: {
    name: "Pro Yearly",
    priceId: process.env.STRIPE_PRICE_YEARLY || "",
    amount: 9900, // $99.00
    interval: "year" as const,
  },
  lifetime: {
    name: "Founding Member",
    priceId: process.env.STRIPE_PRICE_LIFETIME || "",
    amount: 14900, // $149.00
    interval: null, // one-time
  },
} as const;

export type PlanKey = keyof typeof PLANS;

/** Check if a user has an active subscription */
export function isSubscribed(status: string | null): boolean {
  return status === "active" || status === "trialing" || status === "lifetime";
}
