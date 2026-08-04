import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";
import {
  mapRevenueCatEvent,
  isValidRevenueCatAuth,
  type RevenueCatWebhookBody,
} from "@/lib/revenuecat";
import logger from "@/lib/logger";

/**
 * POST /api/revenuecat/webhook
 *
 * RevenueCat server-to-server webhook for iOS In-App Purchases. Translates each
 * entitlement event into a row in `subscriptions` with provider='apple', so the
 * app reads premium status through the same entitlement helper as Stripe.
 *
 * Configure RevenueCat → Project → Webhooks with this URL and an Authorization
 * header value equal to REVENUECAT_WEBHOOK_SECRET. `app_user_id` must be the
 * Supabase user id (set as the RevenueCat appUserID in the client SDK).
 */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  if (!isValidRevenueCatAuth(request.headers.get("authorization"))) {
    logger.warn({ requestId }, "RevenueCat webhook: invalid authorization");
    return apiError("Unauthorized", 401);
  }

  let body: RevenueCatWebhookBody;
  try {
    body = (await request.json()) as RevenueCatWebhookBody;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const event = body?.event;
  if (!event?.app_user_id) {
    logger.warn({ requestId }, "RevenueCat webhook: missing event or app_user_id");
    // Ack so RevenueCat doesn't retry an unprocessable payload.
    return NextResponse.json({ received: true });
  }

  const update = mapRevenueCatEvent(event);
  if (!update) {
    logger.debug({ requestId, type: event.type }, "RevenueCat webhook: event ignored");
    return NextResponse.json({ received: true });
  }

  try {
    const db = createAdminClient();
    const { error } = await db.from("subscriptions").upsert(
      {
        user_id: event.app_user_id,
        provider: "apple",
        plan_type: update.planType,
        status: update.status,
        current_period_end: update.currentPeriodEnd,
        cancel_at_period_end: update.cancelAtPeriodEnd,
        provider_product_id: update.productId,
        provider_transaction_id:
          event.original_transaction_id ?? event.transaction_id ?? null,
      },
      { onConflict: "user_id" }
    );
    if (error) throw new Error(`subscriptions upsert failed: ${error.message}`);

    logger.info(
      { requestId, userId: event.app_user_id, type: event.type, plan: update.planType, status: update.status },
      "RevenueCat entitlement updated"
    );
  } catch (err) {
    Sentry.captureException(err, { extra: { requestId, eventType: event.type } });
    logger.error({ requestId, err, eventType: event.type }, "RevenueCat webhook handler error");
    // 500 so RevenueCat retries.
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
