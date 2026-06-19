import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError, handleApiError } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";
import { getStripe } from "@/lib/stripe";
import { stripeEnv } from "@/lib/env";
import logger from "@/lib/logger";

/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Billing Portal session so the user can manage or cancel
 * their subscription and update payment details. Returns `{ url }`.
 *
 * Only resolves Stripe-billed customers. Apple/Google IAP subscriptions are
 * managed through the platform's own subscription settings, not here — the
 * mobile UI links to those instead.
 */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  try {
    const { user, supabase } = await requireAuth();
    stripeEnv(); // validate Stripe env before hitting the API
    const stripe = getStripe();

    // Prefer the customer id stored from checkout/webhooks (RLS: own row).
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId: string | null = sub?.stripe_customer_id ?? null;

    // Fall back to a Stripe lookup by email (e.g. row not yet written).
    if (!customerId && user.email) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = customers.data[0]?.id ?? null;
    }

    if (!customerId) {
      return apiError("No billing account found for this user", 404);
    }

    const origin = request.headers.get("origin") ?? "http://localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/profile`,
    });

    logger.info({ requestId, userId: user.id }, "Stripe billing portal session created");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
