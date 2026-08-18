import { z } from "zod";

/** Core Supabase env — required for every SSR page and API route. */
const coreSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** Supabase service credentials — server-only and never exposed to clients. */
const supabaseAdminSchema = coreSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

/** AI/vector env — only required by chat, search, and extraction routes. */
const serverSchema = supabaseAdminSchema.extend({
  ANTHROPIC_API_KEY: z.string().min(1),
  PINECONE_API_KEY: z.string().min(1),
  PINECONE_INDEX: z.string().default("craftwell"),
  VOYAGE_API_KEY: z.string().min(1),
});

/** Manual ingestion controls and optional source-specific credentials. */
const ingestionSchema = supabaseAdminSchema.extend({
  ADMIN_API_KEY: z.string().min(16),
  YOUTUBE_API_KEY: z.string().min(1).optional(),
  NCBI_API_KEY: z.string().min(1).optional(),
  NCBI_CONTACT_EMAIL: z.string().email().optional(),
});

/** Vercel adds this value to scheduled requests as a Bearer token. */
const cronSchema = z.object({
  CRON_SECRET: z.string().min(16),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type CoreEnv = z.infer<typeof coreSchema>;
export type SupabaseAdminEnv = z.infer<typeof supabaseAdminSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
export type IngestionEnv = z.infer<typeof ingestionSchema>;
export type CronEnv = z.infer<typeof cronSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

function validateEnv<T>(schema: z.ZodType<T>, data: Record<string, unknown>, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Missing or invalid environment variables (${label}):\n${formatted}`);
  }
  return result.data;
}

let _coreEnv: CoreEnv | undefined;
let _supabaseAdminEnv: SupabaseAdminEnv | undefined;
let _serverEnv: ServerEnv | undefined;
let _ingestionEnv: IngestionEnv | undefined;
let _cronEnv: CronEnv | undefined;
let _clientEnv: ClientEnv | undefined;

/** Validates only Supabase keys — safe to call from any SSR page. */
export function coreEnv(): CoreEnv {
  if (!_coreEnv) {
    _coreEnv = validateEnv(coreSchema, process.env, "core");
  }
  return _coreEnv;
}

/** Validates only the credentials needed by a Supabase service-role client. */
export function supabaseAdminEnv(): SupabaseAdminEnv {
  if (!_supabaseAdminEnv) {
    _supabaseAdminEnv = validateEnv(supabaseAdminSchema, process.env, "supabase-admin");
  }
  return _supabaseAdminEnv;
}

/** Validates AI and vector-search secrets. */
export function serverEnv(): ServerEnv {
  if (!_serverEnv) {
    _serverEnv = validateEnv(serverSchema, process.env, "server");
  }
  return _serverEnv;
}

/** Validates manual ingestion auth and optional external-source credentials. */
export function ingestionEnv(): IngestionEnv {
  if (!_ingestionEnv) {
    _ingestionEnv = validateEnv(ingestionSchema, process.env, "ingestion");
  }
  return _ingestionEnv;
}

export function cronEnv(): CronEnv {
  if (!_cronEnv) {
    _cronEnv = validateEnv(cronSchema, process.env, "cron");
  }
  return _cronEnv;
}

export function clientEnv(): ClientEnv {
  if (!_clientEnv) {
    _clientEnv = validateEnv(clientSchema, process.env, "client");
  }
  return _clientEnv;
}

/** Stripe env — only required by /api/stripe/* routes. */
const stripeSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_MONTHLY: z.string().min(1),
  STRIPE_PRICE_ANNUAL: z.string().min(1),
  STRIPE_PRICE_LIFETIME: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
});

export type StripeEnv = z.infer<typeof stripeSchema>;

let _stripeEnv: StripeEnv | undefined;

/** Validates Stripe secrets — only call from Stripe API routes. */
export function stripeEnv(): StripeEnv {
  if (!_stripeEnv) {
    _stripeEnv = validateEnv(stripeSchema, process.env, "stripe");
  }
  return _stripeEnv;
}
