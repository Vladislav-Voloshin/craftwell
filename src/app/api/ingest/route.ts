import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidBearerToken } from "@/lib/api/bearer-token";
import { ingestionEnv } from "@/lib/env";
import { runFullEmbeddingPipeline } from "@/lib/ingestion/embed-pipeline";
import { runProtocolExtraction } from "@/lib/ingestion/protocol-extractor";
import { runWeeklyEvidenceIngestion } from "@/lib/ingestion/evidence/weekly";
import { getRequestId } from "@/lib/api/request-id";
import logger from "@/lib/logger";

const ingestionRequestSchema = z
  .object({
    step: z.enum([
      "scrape-podcasts",
      "scrape-newsletters",
      "chunk-podcasts",
      "chunk-newsletters",
      "weekly-evidence",
      "backfill-huberman-evidence",
      "backfill-huberman-lab",
      "backfill-guest-research",
      "backfill-recent-research",
      "embed",
      "extract-protocols",
      "full-pipeline",
    ]),
  })
  .strict();

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const log = logger.child({ requestId, route: "POST /api/ingest" });

  // Simple API key auth for admin operations
  const authHeader = request.headers.get("authorization");
  let adminKey: string;
  try {
    adminKey = ingestionEnv().ADMIN_API_KEY;
  } catch (error) {
    log.error({ err: error }, "Ingestion admin endpoint is not configured");
    // Fail closed without exposing whether this privileged endpoint is configured.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasValidBearerToken(authHeader, adminKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit even for admin — prevent accidental pipeline spam
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "admin";
  const { checkIpRateLimit } = await import("@/lib/api/rate-limit");
  const rateLimited = checkIpRateLimit(ip, "/api/ingest");
  if (rateLimited) return rateLimited;

  const parsed = ingestionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request body must contain one supported ingestion step" },
      { status: 400 }
    );
  }
  const { step } = parsed.data;
  log.info({ step }, "Ingestion pipeline triggered");

  try {
    switch (step) {
      case "scrape-podcasts": {
        const result = await runWeeklyEvidenceIngestion({
          trigger: "manual",
          requestId,
          sourceKeys: ["huberman-rss", "huberman-episode-pages"],
        });
        return NextResponse.json(result, {
          status: result.status === "failed" ? 500 : 200,
        });
      }

      case "scrape-newsletters": {
        return NextResponse.json(
          {
            error:
              "Raw newsletter copying is disabled. Use weekly-evidence for provenance-safe metadata ingestion.",
          },
          { status: 410 }
        );
      }

      case "chunk-podcasts": {
        return NextResponse.json(
          {
            error:
              "Automatic transcript chunking is disabled unless the content is licensed or user-provided.",
          },
          { status: 410 }
        );
      }

      case "chunk-newsletters": {
        return NextResponse.json(
          {
            error:
              "Automatic newsletter chunking is disabled unless the content is licensed or user-provided.",
          },
          { status: 410 }
        );
      }

      case "weekly-evidence": {
        const result = await runWeeklyEvidenceIngestion({
          trigger: "manual",
          requestId,
        });
        return NextResponse.json(result, {
          status: result.status === "failed" ? 500 : 200,
        });
      }

      case "backfill-huberman-evidence": {
        const result = await runWeeklyEvidenceIngestion({
          trigger: "backfill",
          requestId,
          sourceKeys: ["huberman-rss"],
          hubermanPublishedSince: new Date("2020-12-01T00:00:00.000Z"),
        });
        return NextResponse.json(result, {
          status: result.status === "failed" ? 500 : 200,
        });
      }

      case "backfill-recent-research": {
        const now = new Date();
        const result = await runWeeklyEvidenceIngestion({
          trigger: "backfill",
          requestId,
          now,
          sourceKeys: ["pubmed-health"],
          pubmedFrom: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
          pubmedMaxResults: 500,
        });
        return NextResponse.json(result, {
          status: result.status === "failed" ? 500 : 200,
        });
      }

      case "backfill-huberman-lab": {
        const now = new Date();
        const result = await runWeeklyEvidenceIngestion({
          trigger: "backfill",
          requestId,
          now,
          sourceKeys: ["huberman-stanford-lab"],
          pubmedFrom: new Date("2000-01-01T00:00:00.000Z"),
          pubmedMaxResults: 500,
        });
        return NextResponse.json(result, {
          status: result.status === "failed" ? 500 : 200,
        });
      }

      case "backfill-guest-research": {
        const now = new Date();
        const result = await runWeeklyEvidenceIngestion({
          trigger: "backfill",
          requestId,
          now,
          sourceKeys: ["pubmed-guests", "crossref-guests"],
          pubmedFrom: new Date("1990-01-01T00:00:00.000Z"),
          guestCandidateLimit: 10,
          guestResultsPerCandidate: 10,
          crossrefResultsPerCandidate: 50,
          includeRecentGuests: false,
        });
        return NextResponse.json(result, {
          status: result.status === "failed" ? 500 : 200,
        });
      }

      case "embed": {
        const result = await runFullEmbeddingPipeline();
        return NextResponse.json({ success: true, ...result });
      }

      case "extract-protocols": {
        const totalProtocols = await runProtocolExtraction();
        return NextResponse.json({ success: true, totalProtocols });
      }

      case "full-pipeline": {
        const evidence = await runWeeklyEvidenceIngestion({
          trigger: "manual",
          requestId,
        });
        return NextResponse.json(
          {
            success: evidence.ok,
            evidence,
            note: "Raw third-party content copying is intentionally excluded.",
          },
          { status: evidence.status === "failed" ? 500 : 200 }
        );
      }

      default:
        return NextResponse.json({ error: `Unknown step: ${step}` }, { status: 400 });
    }
  } catch (error) {
    log.error({ err: error }, "Ingestion error");
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Ingestion failed"
            : error instanceof Error
              ? error.message
              : String(error),
      },
      { status: 500 }
    );
  }
}
