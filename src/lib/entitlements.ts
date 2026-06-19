import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { coreEnv } from "@/lib/env";
import logger from "@/lib/logger";
import type {
  PlanType,
  SubscriptionStatus,
  EntitlementProvider,
} from "@/lib/types/database";

/**
 * The single source of truth for "is this user premium right now?"
 *
 * Provider-agnostic by design: Stripe (web) and Apple/Google IAP (mobile) all
 * resolve through this shape, so feature-gating and the paywall never care
 * where the money came from. This is what lets the iOS IAP work (Phase 3)
 * drop in without touching every gated feature.
 */
export interface Entitlement {
  isPremium: boolean;
  planType: PlanType | null;
  status: SubscriptionStatus | null;
  source: EntitlementProvider | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Entitlement for a user with no (or no active) subscription row. */
const FREE: Entitlement = {
  isPremium: false,
  planType: null,
  status: null,
  source: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

/** Recurring-plan statuses that grant access while in good standing. */
const PREMIUM_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "active",
  "trialing",
]);

/** Columns the entitlement layer needs — identical across providers. */
const ENTITLEMENT_COLUMNS =
  "plan_type, status, provider, current_period_end, cancel_at_period_end";

interface EntitlementRow {
  plan_type: PlanType;
  status: SubscriptionStatus;
  provider: EntitlementProvider | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/**
 * Pure entitlement decision (exported for direct unit testing):
 * - lifetime is premium while its row is `active`
 * - recurring plans are premium while `active` or `trialing`
 * - everything else (past_due, canceled, paused, incomplete, no row) is free
 */
export function computeIsPremium(
  row: Pick<EntitlementRow, "plan_type" | "status"> | null
): boolean {
  if (!row) return false;
  if (row.plan_type === "lifetime") return row.status === "active";
  return PREMIUM_STATUSES.has(row.status);
}

function toEntitlement(row: EntitlementRow | null): Entitlement {
  if (!row) return FREE;
  return {
    isPremium: computeIsPremium(row),
    planType: row.plan_type,
    status: row.status,
    // Legacy rows predate the provider column → treat as Stripe.
    source: row.provider ?? "stripe",
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
  };
}

function getServiceClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createServiceClient(coreEnv().NEXT_PUBLIC_SUPABASE_URL, serviceKey);
}

/**
 * Entitlement for the currently-authenticated request (RLS — users read their
 * own row). Use from route handlers / server components that already have the
 * user's session. Fails closed (returns FREE) on a read error.
 */
export async function getMyEntitlement(): Promise<Entitlement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return FREE;

  const { data, error } = await supabase
    .from("subscriptions")
    .select(ENTITLEMENT_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, userId: user.id }, "entitlement read failed");
    return FREE;
  }
  return toEntitlement(data as EntitlementRow | null);
}

/**
 * Entitlement for an arbitrary user via the service role (bypasses RLS). Use
 * from server-internal paths that gate by cost/feature where there is no
 * request session for that user (e.g. AI chat usage limits). Fails closed.
 */
export async function getEntitlementForUser(
  userId: string,
  db?: SupabaseClient
): Promise<Entitlement> {
  const client = db ?? getServiceClient();
  const { data, error } = await client
    .from("subscriptions")
    .select(ENTITLEMENT_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, userId }, "entitlement read failed");
    return FREE;
  }
  return toEntitlement(data as EntitlementRow | null);
}
