import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError, handleApiError } from "@/lib/api/helpers";
import { getEmbedding } from "@/lib/pinecone/embeddings";
import { queryVectors } from "@/lib/pinecone/client";
import { getRequestId } from "@/lib/api/request-id";
import { PINECONE_TIMEOUT_MS, SEARCH_VECTOR_PAGE_SIZE, SEARCH_TEXT_PAGE_SIZE } from "@/lib/constants";
import { checkApiRateLimit } from "@/lib/api/rate-limit";
import logger from "@/lib/logger";

/** Run an async operation with a timeout. Rejects if it takes too long. */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const log = logger.child({ requestId, route: "GET /api/search" });

  try {
    const { user, supabase } = await requireAuth();

    const rateLimited = await checkApiRateLimit(user.id, "/api/search", supabase);
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      return apiError("Query must be at least 2 characters", 400);
    }

    // Strip PostgREST filter-syntax characters that could break .or() parsing.
    // Commas, parens, and dots are structural; %, _ are LIKE wildcards.
    const q = query.trim().replace(/[%_(),."'\\]/g, "");

    if (q.length < 2) {
      return apiError(
        "Query must contain at least 2 searchable characters",
        400,
      );
    }

    // Semantic search uses the original trimmed query (no stripping needed)
    const semanticQuery = query.trim();

    // Run both searches in parallel
    const [protocolResults, knowledgeResults] = await Promise.all([
      // 1. Protocol text search via Supabase
      supabase
        .from("protocols")
        .select(
          "id, title, slug, category, description, effectiveness_rank, difficulty",
        )
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .order("effectiveness_rank")
        .limit(SEARCH_VECTOR_PAGE_SIZE),

      // 2. Semantic search via Pinecone (with timeout and graceful degradation)
      (async () => {
        try {
          const embedding = await withTimeout(
            getEmbedding(semanticQuery),
            PINECONE_TIMEOUT_MS,
            "Embedding",
          );
          const matches = await withTimeout(
            queryVectors(embedding, 8),
            PINECONE_TIMEOUT_MS,
            "Pinecone query",
          );
          return {
            results: matches.map((m) => ({
              score: m.score,
              source_type: m.metadata?.source_type,
              source_title: m.metadata?.source_title,
              content: (m.metadata?.content as string)?.slice(0, 300),
            })),
            degraded: false,
          };
        } catch (err) {
          log.warn(
            { err },
            "Semantic search unavailable — falling back to text-only search",
          );
          return { results: [], degraded: true };
        }
      })(),
    ]);

    // If semantic search failed, run a broader text fallback search
    let fallbackResults: typeof protocolResults.data = null;
    if (knowledgeResults.degraded) {
      const { data } = await supabase
        .from("protocols")
        .select(
          "id, title, slug, category, description, effectiveness_rank, difficulty",
        )
        .or(
          `title.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`,
        )
        .order("effectiveness_rank")
        .limit(SEARCH_TEXT_PAGE_SIZE);
      fallbackResults = data;
    }

    return NextResponse.json({
      protocols: protocolResults.data || [],
      knowledge: knowledgeResults.results,
      ...(knowledgeResults.degraded && {
        fallback_protocols: fallbackResults || [],
        degraded: true,
      }),
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
