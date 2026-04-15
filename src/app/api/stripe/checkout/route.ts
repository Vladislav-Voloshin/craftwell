import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError, handleApiError, parseBody } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";
import { checkApiRateLimit } from "@/lib/api/rate-limit";
import { getStripe, PLANS, type PlanKey } from "@/lib/stripe";
import logger from "@/lib/logger";
import { z } from "zod";
import type Stripe from "stripe";

const checkoutSchema = z.object({
  plan: z.enum(["monthly", "yearly", "lifetime"]),
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const log = logger.child({ requestId, route: "POST /api/stripe/checkout" });

  try {
    const { user, supabase } = await requireAuth();

    const rateLimited = await checkApiRateLimit(user.id, "/api/stripe/checkout");
    if (rateLimited) return rateLimited;

    const body = await parseBody(request, checkoutSchema);
    if (body instanceof Response) return body;

    const { plan } = body;
    const planConfig = PLANS[plan as PlanKey];

    if (!planConfig.priceId) {
      return apiError("Plan not configured. Contact support.", 500);
    }

    const stripe = getStripe();

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from("users")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || profile?.email || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabase
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://craftwell.vercel.app";

    // Create Checkout session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: plan === "lifetime" ? "payment" : "subscription",
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      success_url: `${appUrl}/protocols?checkout=success`,
      cancel_url: `${appUrl}/pricing?checkout=canceled`,
      metadata: {
        supabase_user_id: user.id,
        plan,
      },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    log.info({ userId: user.id, plan, sessionId: session.id }, "Checkout session created");

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
