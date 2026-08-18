import { NextRequest } from "next/server";
import { getRequestId } from "@/lib/api/request-id";
import { hasValidBearerToken } from "@/lib/api/bearer-token";
import { cronEnv } from "@/lib/env";
import { runWeeklyEvidenceIngestion } from "@/lib/ingestion/evidence/weekly";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  let secret: string;
  try {
    secret = cronEnv().CRON_SECRET;
  } catch (error) {
    logger.error({ err: error }, "Weekly ingestion cron is not configured");
    return Response.json({ error: "Weekly ingestion is not configured" }, { status: 503 });
  }

  if (!hasValidBearerToken(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestId = getRequestId(request);
  const result = await runWeeklyEvidenceIngestion({
    trigger: "cron",
    requestId,
  });

  return Response.json(
    { requestId, ...result },
    { status: result.status === "failed" ? 500 : 200 }
  );
}
