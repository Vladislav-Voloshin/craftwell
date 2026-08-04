import type { PlanType, SubscriptionStatus } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// RevenueCat → Craftwell entitlement mapping
//
// RevenueCat is the iOS (Apple IAP) purchase path. Its server-to-server
// webhooks tell us when a user's entitlement changes; we translate each event
// into a row in the same `subscriptions` table Stripe writes to, with
// provider='apple'. The app then reads premium status through the one
// provider-agnostic helper in src/lib/entitlements.ts.
// ---------------------------------------------------------------------------

/** App Store Connect product IDs → our plan types. Keep in sync with the products you create. */
export const REVENUECAT_PRODUCTS: Record<string, PlanType> = {
  craftwell_premium_monthly: "monthly",
  craftwell_premium_annual: "annual",
  craftwell_premium_lifetime: "lifetime",
};

/** The subset of a RevenueCat webhook event we rely on. */
export interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  product_id?: string;
  period_type?: string; // NORMAL | TRIAL | INTRO
  expiration_at_ms?: number | null;
  transaction_id?: string;
  original_transaction_id?: string;
  store?: string;
  environment?: string; // PRODUCTION | SANDBOX
}

export interface RevenueCatWebhookBody {
  api_version?: string;
  event: RevenueCatEvent;
}

/** The entitlement state a webhook event implies. */
export interface RcEntitlementUpdate {
  planType: PlanType;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  productId: string;
}

/** Events that mean the user currently has access. */
const ACTIVE_EVENTS: ReadonlySet<string> = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "NON_RENEWING_PURCHASE", // lifetime
]);

/**
 * Translate a RevenueCat event into an entitlement update, or `null` to ignore
 * it (unknown product, or a non-entitlement event like TEST / TRANSFER).
 *
 * - EXPIRATION → access lost (canceled)
 * - BILLING_ISSUE → past_due
 * - CANCELLATION → auto-renew off, but access remains until expiration
 * - purchase/renewal/etc → active (or trialing during a free trial)
 */
export function mapRevenueCatEvent(event: RevenueCatEvent): RcEntitlementUpdate | null {
  const productId = event.product_id;
  if (!productId) return null;

  const planType = REVENUECAT_PRODUCTS[productId];
  if (!planType) return null; // product we don't recognise

  const currentPeriodEnd = event.expiration_at_ms
    ? new Date(event.expiration_at_ms).toISOString()
    : null;

  switch (event.type) {
    case "EXPIRATION":
      return { planType, status: "canceled", currentPeriodEnd, cancelAtPeriodEnd: false, productId };
    case "BILLING_ISSUE":
      return { planType, status: "past_due", currentPeriodEnd, cancelAtPeriodEnd: false, productId };
    case "CANCELLATION":
      // Auto-renew turned off; the user keeps access until expiration.
      return { planType, status: "active", currentPeriodEnd, cancelAtPeriodEnd: true, productId };
    default:
      if (ACTIVE_EVENTS.has(event.type)) {
        const trialing = event.period_type === "TRIAL";
        return {
          planType,
          status: trialing ? "trialing" : "active",
          currentPeriodEnd,
          cancelAtPeriodEnd: false,
          productId,
        };
      }
      return null; // TEST, TRANSFER, SUBSCRIBER_ALIAS, etc.
  }
}

/**
 * Validate the `Authorization` header RevenueCat sends. The value is a shared
 * secret you configure in the RevenueCat dashboard's webhook settings and store
 * as REVENUECAT_WEBHOOK_SECRET. Throws if the secret isn't configured.
 */
export function isValidRevenueCatAuth(headerValue: string | null): boolean {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing REVENUECAT_WEBHOOK_SECRET");
  return headerValue === secret;
}
