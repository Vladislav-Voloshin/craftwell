import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { coreEnv } from "@/lib/env";
import logger from "@/lib/logger";
import type Stripe from "stripe";

const log = logger.child({ route: "POST /api/stripe/webhook" });

/** Get admin Supabase client for webhook processing (no user auth context). */
function getAdmin() {
  const env = coreEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey);
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    log.error("STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    log.warn({ err }, "Webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = getAdmin();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const plan = session.metadata?.plan;

        if (!userId) break;

        if (plan === "lifetime") {
          // One-time payment — lifetime access
          await admin.from("users").update({
            subscription_status: "lifetime",
            subscription_plan: "lifetime",
          }).eq("id", userId);
        } else if (session.subscription) {
          // Subscription created — store the Stripe subscription ID
          const subId = typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
          await admin.from("users").update({
            subscription_status: "active",
            subscription_plan: plan,
            subscription_stripe_id: subId,
          }).eq("id", userId);
        }

        // Log the event
        await admin.from("subscription_events").insert({
          user_id: userId,
          stripe_event_id: event.id,
          event_type: event.type,
          subscription_status: plan === "lifetime" ? "lifetime" : "active",
          plan,
          amount_cents: session.amount_total,
          currency: session.currency,
        });

        log.info({ userId, plan, eventId: event.id }, "Checkout completed");
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

        const { data: user } = await admin
          .from("users")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (user) {
          const mappedStatus = sub.status === "active" ? "active"
            : sub.status === "past_due" ? "past_due"
            : "canceled";
          await admin.from("users").update({
            subscription_status: mappedStatus,
          }).eq("id", user.id);

          await admin.from("subscription_events").insert({
            user_id: user.id,
            stripe_event_id: event.id,
            event_type: event.type,
            subscription_status: sub.status,
          });

          log.info({ userId: user.id, status: sub.status }, "Subscription updated");
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

        const { data: user } = await admin
          .from("users")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (user) {
          await admin.from("users").update({
            subscription_status: "free",
            subscription_plan: null,
            subscription_stripe_id: null,
            subscription_current_period_end: null,
          }).eq("id", user.id);

          await admin.from("subscription_events").insert({
            user_id: user.id,
            stripe_event_id: event.id,
            event_type: event.type,
            subscription_status: "canceled",
          });

          log.info({ userId: user.id }, "Subscription canceled");
        }
        break;
      }

      default:
        log.debug({ type: event.type }, "Unhandled webhook event");
    }
  } catch (err) {
    log.error({ err, eventType: event.type, eventId: event.id }, "Webhook processing error");
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
