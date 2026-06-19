import { NextRequest, NextResponse } from "next/server";
import { getMyEntitlement } from "@/lib/entitlements";
import { getRequestId } from "@/lib/api/request-id";
import { handleApiError } from "@/lib/api/helpers";

/**
 * GET /api/entitlement
 *
 * Returns the current user's entitlement (premium status, plan, source). The
 * shape is identical whether the purchase came from Stripe (web) or Apple/Google
 * IAP (mobile), so the client paywall and premium features can gate on one
 * response. Anonymous/free users get `{ isPremium: false }`.
 *
 * Reads the session cookie, so this route is always dynamic.
 */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const entitlement = await getMyEntitlement();
    return NextResponse.json(entitlement);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
