import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { coreEnv } from "@/lib/env";

/**
 * Service-role Supabase client (bypasses RLS). Server-only — never import this
 * into client code. Uses only the core Supabase env, not the full AI/ingestion
 * env, so routes that just need privileged DB access stay lightweight.
 */
export function createAdminClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(coreEnv().NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey);
}
