import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError, handleApiError } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";
import { getStripe } from "@/lib/stripe";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const log = logger.child({ requestId, route: "POST /api/stripe/portal" });

  try {
    const { user, supabase } = await requireAuth();

    const { data: profile } = await supabase
      .from("users")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return apiError("No subscription found", 404);
    }

    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://craftwell.vercel.app";

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/profile`,
    });

    log.info({ userId: user.id }, "Billing portal session created");

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
