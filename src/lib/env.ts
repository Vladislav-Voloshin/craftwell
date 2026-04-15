import { z } from 'zod';

/** Core Supabase env — required for every SSR page and API route. */
const coreSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** Full server env — only required by AI/ingestion routes. */
const serverSchema = coreSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  PINECONE_API_KEY: z.string().min(1),
  PINECONE_INDEX: z.string().default('craftwell'),
  VOYAGE_API_KEY: z.string().min(1),
  YOUTUBE_API_KEY: z.string().min(1),
  ADMIN_API_KEY: z.string().min(1),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type CoreEnv = z.infer<typeof coreSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

function validateEnv<T>(schema: z.ZodType<T>, data: Record<string, unknown>, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Missing or invalid environment variables (${label}):\n${formatted}`);
  }
  return result.data;
}

let _coreEnv: CoreEnv | undefined;
let _serverEnv: ServerEnv | undefined;
let _clientEnv: ClientEnv | undefined;

/** Validates only Supabase keys — safe to call from any SSR page. */
export function coreEnv(): CoreEnv {
  if (!_coreEnv) {
    _coreEnv = validateEnv(coreSchema, process.env, 'core');
  }
  return _coreEnv;
}

/** Validates all AI/ingestion secrets — only call from AI or ingest routes. */
export function serverEnv(): ServerEnv {
  if (!_serverEnv) {
    _serverEnv = validateEnv(serverSchema, process.env, 'server');
  }
  return _serverEnv;
}

export function clientEnv(): ClientEnv {
  if (!_clientEnv) {
    _clientEnv = validateEnv(clientSchema, process.env, 'client');
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
    _stripeEnv = validateEnv(stripeSchema, process.env, 'stripe');
  }
  return _stripeEnv;
}
