import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Pinecone } from "@pinecone-database/pinecone";

type ServiceStatus = "healthy" | "degraded" | "unhealthy";

interface ServiceCheck {
  status: ServiceStatus;
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: ServiceStatus;
  uptime: number;
  version: string;
  checks: {
    supabase: ServiceCheck;
    pinecone: ServiceCheck;
    anthropic: ServiceCheck;
  };
  timestamp: string;
}

/** Measure execution time of an async operation. */
async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: Math.round(performance.now() - start) };
}

/** Check Supabase connectivity with a lightweight query. */
async function checkSupabase(): Promise<ServiceCheck> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { status: "unhealthy", error: "Missing Supabase credentials" };
  }

  try {
    const client = createClient(url, key);
    const { ms } = await timed(async () => {
      const { error } = await client.from("protocols").select("id").limit(1);
      if (error) throw error;
    });
    return { status: "healthy", latencyMs: ms };
  } catch (err) {
    return {
      status: "unhealthy",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Check Pinecone connectivity by describing the index. */
async function checkPinecone(): Promise<ServiceCheck> {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX ?? "craftwell";

  if (!apiKey) {
    return { status: "unhealthy", error: "Missing Pinecone API key" };
  }

  try {
    const pc = new Pinecone({ apiKey });
    const { ms } = await timed(async () => {
      const index = pc.index(indexName);
      await index.describeIndexStats();
    });
    return { status: "healthy", latencyMs: ms };
  } catch (err) {
    return {
      status: "unhealthy",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Check Anthropic -- only verify the API key is configured. */
function checkAnthropic(): ServiceCheck {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { status: "unhealthy", error: "Missing Anthropic API key" };
  }
  return { status: "healthy" };
}

/** Derive overall status from individual checks. */
function deriveOverallStatus(checks: HealthResponse["checks"]): ServiceStatus {
  const statuses = Object.values(checks).map((c) => c.status);
  if (statuses.every((s) => s === "healthy")) return "healthy";
  if (statuses.some((s) => s === "unhealthy")) return "degraded";
  return "degraded";
}

export const dynamic = "force-dynamic";

export async function GET() {
  const [supabase, pinecone] = await Promise.all([
    checkSupabase(),
    checkPinecone(),
  ]);

  const anthropic = checkAnthropic();

  const checks = { supabase, pinecone, anthropic };

  const response: HealthResponse = {
    status: deriveOverallStatus(checks),
    uptime: Math.round(process.uptime()),
    version: process.env.npm_package_version ?? "0.1.0",
    checks,
    timestamp: new Date().toISOString(),
  };

  const httpStatus = response.status === "healthy" ? 200 : 503;

  return NextResponse.json(response, {
    status: httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
