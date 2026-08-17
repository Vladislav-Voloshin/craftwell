import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, apiError, handleApiError, parseBody } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";
import { getStripe, PLANS, type PlanType } from "@/lib/stripe";
import { stripeEnv } from "@/lib/env";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const checkoutBodySchema = z.object({
  plan: z.enum(["monthly", "annual", "lifetime"]),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count existing lifetime purchases from the subscriptions table. */
async function getLifetimePurchaseCount(): Promise<number> {
  const db = createAdminClient();
  const { count, error } = await db
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("plan_type", "lifetime")
    .eq("status", "active");

  if (error) throw new Error(`Failed to count lifetime purchases: ${error.message}`);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// POST /api/stripe/checkout
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  try {
    const { user } = await requireAuth();

    const body = await parseBody(request, checkoutBodySchema);
    if (body instanceof Response) return body;

    const { plan } = body;
    let stripe: ReturnType<typeof getStripe>;
    try {
      stripeEnv(); // validate all Stripe env vars before hitting the API
      stripe = getStripe();
    } catch (err) {
      logger.error(
        { err, requestId, userId: user.id },
        "Stripe checkout unavailable: configuration is missing or invalid"
      );
      return apiError(
        "Checkout is temporarily unavailable. Your account was not charged.",
        503
      );
    }
    const planConfig = PLANS[plan as PlanType];

    // Lifetime cap check — best-effort; race conditions are low-risk at 500-unit scale
    if (plan === "lifetime") {
      const sold = await getLifetimePurchaseCount();
      if (sold >= PLANS.lifetime.purchaseCap) {
        return apiError("Lifetime plan is sold out", 410);
      }
    }

    // Resolve or create a Stripe customer tied to this Supabase user
    const existingCustomers = await stripe.customers.list({
      email: user.email ?? undefined,
      limit: 1,
    });

    const customer =
      existingCustomers.data[0] ??
      (await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      }));

    const origin = request.headers.get("origin") ?? "http://localhost:3000";

    // Build session params shared by all plans
    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      customer: customer.id,
      mode: planConfig.mode,
      line_items: [{ price: planConfig.priceId(), quantity: 1 }],
      success_url: `${origin}/dashboard?checkout=success&plan=${plan}`,
      cancel_url: `${origin}/pricing?checkout=canceled`,
      client_reference_id: user.id,
      metadata: {
        supabase_user_id: user.id,
        plan_type: plan,
      },
    };

    // For subscriptions, allow promo codes and set billing cycle anchor
    if (planConfig.mode === "subscription") {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    logger.info(
      { requestId, userId: user.id, plan, sessionId: session.id },
      "Stripe checkout session created"
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
