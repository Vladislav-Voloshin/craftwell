import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { runPodcastScraper } from "@/lib/ingestion/podcast-scraper";
import { runNewsletterScraper } from "@/lib/ingestion/newsletter-scraper";
import { chunkPodcastEpisodes, chunkNewsletters } from "@/lib/ingestion/chunker";
import { runFullEmbeddingPipeline } from "@/lib/ingestion/embed-pipeline";
import { runProtocolExtraction } from "@/lib/ingestion/protocol-extractor";
import { getRequestId } from "@/lib/api/request-id";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const log = logger.child({ requestId, route: "POST /api/ingest" });

  // Simple API key auth for admin operations
  const authHeader = request.headers.get("authorization");
  const { ADMIN_API_KEY: adminKey } = serverEnv();

  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit even for admin — prevent accidental pipeline spam
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "admin";
  const { checkIpRateLimit } = await import("@/lib/api/rate-limit");
  const rateLimited = checkIpRateLimit(ip, "/api/ingest");
  if (rateLimited) return rateLimited;

  const { step } = await request.json();
  log.info({ step }, "Ingestion pipeline triggered");

  try {
    switch (step) {
      case "scrape-podcasts": {
        const result = await runPodcastScraper();
        return NextResponse.json({ success: true, ...result });
      }

      case "scrape-newsletters": {
        const result = await runNewsletterScraper();
        return NextResponse.json({ success: true, ...result });
      }

      case "chunk-podcasts": {
        const totalChunks = await chunkPodcastEpisodes();
        return NextResponse.json({ success: true, totalChunks });
      }

      case "chunk-newsletters": {
        const totalChunks = await chunkNewsletters();
        return NextResponse.json({ success: true, totalChunks });
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
        // Run the complete ingestion pipeline
        const podcasts = await runPodcastScraper();
        const newsletters = await runNewsletterScraper();
        const podcastChunks = await chunkPodcastEpisodes();
        const newsletterChunks = await chunkNewsletters();
        const embeddings = await runFullEmbeddingPipeline();
        const protocols = await runProtocolExtraction();

        return NextResponse.json({
          success: true,
          podcasts,
          newsletters,
          chunks: { podcasts: podcastChunks, newsletters: newsletterChunks },
          embeddings,
          protocols,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown step: ${step}` },
          { status: 400 }
        );
    }
  } catch (error) {
    log.error({ err: error }, "Ingestion error");
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === "production"
          ? "Ingestion failed"
          : error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
