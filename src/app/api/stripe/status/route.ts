import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";
import { isSubscribed } from "@/lib/stripe";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const { user, supabase } = await requireAuth();

    const { data: profile } = await supabase
      .from("users")
      .select("subscription_status, subscription_plan, subscription_current_period_end")
      .eq("id", user.id)
      .single();

    const status = profile?.subscription_status || "free";

    return NextResponse.json({
      status,
      plan: profile?.subscription_plan || null,
      isPro: isSubscribed(status),
      periodEnd: profile?.subscription_current_period_end || null,
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
