import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * `current_period_start` / `current_period_end` were removed from the
 * Stripe TypeScript types in SDK v22+ but are still present in webhook payloads.
 * This local extension restores them for safe access.
 */
type StripeSubPayload = Stripe.Subscription & {
  current_period_start: number;
  current_period_end: number;
};
import { constructWebhookEvent } from "@/lib/stripe";
import { coreEnv } from "@/lib/env";
import { apiError } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";
import logger from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import type { PlanType, SubscriptionStatus } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServiceClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = coreEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createServiceClient(NEXT_PUBLIC_SUPABASE_URL, serviceKey);
}

/** Upsert a subscription row keyed by user_id. */
async function upsertSubscription(
  db: ReturnType<typeof getServiceClient>,
  row: {
    user_id: string;
    stripe_customer_id: string;
    stripe_subscription_id: string | null;
    stripe_price_id: string;
    plan_type: PlanType;
    status: SubscriptionStatus;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
  }
) {
  const { error } = await db
    .from("subscriptions")
    .upsert(row, { onConflict: "user_id" });

  if (error) throw new Error(`subscriptions upsert failed: ${error.message}`);
}

/** Map a Stripe subscription status to our internal enum. */
function mapSubStatus(stripeStatus: Stripe.Subscription["status"]): SubscriptionStatus {
  const allowed: SubscriptionStatus[] = [
    "active", "canceled", "past_due", "trialing",
    "incomplete", "incomplete_expired", "paused",
  ];
  return allowed.includes(stripeStatus as SubscriptionStatus)
    ? (stripeStatus as SubscriptionStatus)
    : "incomplete";
}

/** Extract unix epoch (seconds) → ISO string, or null. */
function epochToIso(ts: number | null | undefined): string | null {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(
  db: ReturnType<typeof getServiceClient>,
  session: Stripe.Checkout.Session,
  requestId: string
) {
  const userId = session.metadata?.supabase_user_id ?? session.client_reference_id;
  if (!userId) {
    logger.warn({ requestId, sessionId: session.id }, "checkout.session.completed: missing user id");
    return;
  }

  const planType = (session.metadata?.plan_type ?? "monthly") as PlanType;
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? "";

  if (planType === "lifetime") {
    // One-time payment — no subscription object
    await upsertSubscription(db, {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: null,
      stripe_price_id: session.line_items?.data[0]?.price?.id ?? "",
      plan_type: "lifetime",
      status: "active",
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
    });
  }
  // For subscriptions, the authoritative data arrives via
  // customer.subscription.updated — nothing to write here.

  logger.info({ requestId, userId, planType, sessionId: session.id }, "checkout completed");
}

async function handleSubscriptionUpdated(
  db: ReturnType<typeof getServiceClient>,
  sub: StripeSubPayload,
  requestId: string
) {
  const userId = sub.metadata?.supabase_user_id;
  if (!userId) {
    logger.warn({ requestId, subId: sub.id }, "subscription event: missing supabase_user_id metadata");
    return;
  }

  const priceId = sub.items.data[0]?.price.id ?? "";
  const planType = (sub.metadata?.plan_type ?? "monthly") as PlanType;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  await upsertSubscription(db, {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    plan_type: planType,
    status: mapSubStatus(sub.status),
    current_period_start: epochToIso(sub.current_period_start),
    current_period_end: epochToIso(sub.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at: epochToIso(sub.canceled_at),
  });

  logger.info(
    { requestId, userId, subId: sub.id, status: sub.status },
    "subscription updated"
  );
}

async function handleSubscriptionDeleted(
  db: ReturnType<typeof getServiceClient>,
  sub: StripeSubPayload,
  requestId: string
) {
  const userId = sub.metadata?.supabase_user_id;
  if (!userId) return;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  await upsertSubscription(db, {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    stripe_price_id: sub.items.data[0]?.price.id ?? "",
    plan_type: (sub.metadata?.plan_type ?? "monthly") as PlanType,
    status: "canceled",
    current_period_start: epochToIso(sub.current_period_start),
    current_period_end: epochToIso(sub.current_period_end),
    cancel_at_period_end: false,
    canceled_at: epochToIso(sub.ended_at ?? sub.canceled_at),
  });

  logger.info({ requestId, userId, subId: sub.id }, "subscription deleted/canceled");
}

// ---------------------------------------------------------------------------
// POST /api/stripe/webhook
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  // Raw body required for signature verification — do NOT use request.json()
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    logger.warn({ requestId, err: msg }, "Stripe webhook signature verification failed");
    return apiError(`Webhook signature verification failed: ${msg}`, 400);
  }

  const db = getServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(db, event.data.object as Stripe.Checkout.Session, requestId);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(db, event.data.object as StripeSubPayload, requestId);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(db, event.data.object as StripeSubPayload, requestId);
        break;

      default:
        // Unhandled event — acknowledge receipt so Stripe doesn't retry
        logger.debug({ requestId, eventType: event.type }, "Stripe webhook event ignored");
    }
  } catch (err) {
    Sentry.captureException(err, { extra: { requestId, eventType: event.type } });
    logger.error({ requestId, err, eventType: event.type }, "Stripe webhook handler error");
    // Return 500 so Stripe retries the event
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
