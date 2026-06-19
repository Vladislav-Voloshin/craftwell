import { NextRequest } from "next/server";
import { withTimeout } from "@/lib/api/with-timeout";
import { requireAuth, apiError, handleApiError, parseBody } from "@/lib/api/helpers";
import { queryVectors } from "@/lib/pinecone/client";
import { getEmbedding, getAnthropicClient } from "@/lib/pinecone/embeddings";
import { checkRateLimit } from "@/lib/api/rate-limit";
import {
  CHAT_MAX_MESSAGE_LENGTH as MAX_MESSAGE_LENGTH,
  CHAT_MAX_HISTORY_TURNS as MAX_HISTORY_TURNS,
  CHAT_MAX_TOKENS,
  PINECONE_TIMEOUT_MS,
  PINECONE_TOP_K,
  CHAT_SESSION_TITLE_MAX_LENGTH,
} from "@/lib/constants";
import { z } from "zod";
import { getRequestId } from "@/lib/api/request-id";
import logger from "@/lib/logger";

const chatSchema = z.object({
  message: z.string().min(1, "Message is required").max(MAX_MESSAGE_LENGTH),
  session_id: z.string().uuid().nullish().transform((v) => v ?? undefined),
  protocol_id: z.string().uuid().nullish().transform((v) => v ?? undefined),
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const log = logger.child({ requestId, route: "POST /api/chat" });

  try {
    const { user, supabase } = await requireAuth();
    log.info({ userId: user.id }, "Chat request received");

    const rateLimited = await checkRateLimit(user.id, supabase);
    if (rateLimited) return rateLimited;

    const body = await parseBody(request, chatSchema);
    if (body instanceof Response) return body;

    const trimmedMessage = body.message.trim();
    const { session_id, protocol_id } = body;

    // Create or get session
    let currentSessionId: string | undefined = session_id;
    if (!currentSessionId) {
      const { data: session, error: sessionErr } = await supabase
        .from("chat_sessions")
        .insert({
          user_id: user.id,
          title: trimmedMessage.slice(0, CHAT_SESSION_TITLE_MAX_LENGTH),
          protocol_id: protocol_id || null,
        })
        .select("id")
        .single();

      if (sessionErr || !session) {
        return apiError("Failed to create chat session", 500);
      }
      currentSessionId = session.id;
    }

    // Save user message
    const { error: insertErr } = await supabase.from("chat_messages").insert({
      session_id: currentSessionId,
      role: "user",
      content: trimmedMessage,
    });
    if (insertErr) {
      log.error({ err: insertErr }, "Failed to save user message");
    }

    // Fetch conversation history for multi-turn context
    const history = await fetchConversationHistory(supabase, currentSessionId!);

    // Get relevant context via RAG + user profile in parallel
    const [{ contextText, sources, ragUnavailable }, { data: survey }] = await Promise.all([
      fetchRAGContext(trimmedMessage, log),
      supabase
        .from("survey_responses")
        .select("focus_areas, health_goals")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    // Build system prompt with optional user profile personalisation
    let systemPrompt = buildSystemPrompt(contextText, ragUnavailable, survey ?? undefined);

    if (protocol_id) {
      // Single joined query to avoid N+1 (was 2 separate queries)
      const { data: protocol } = await supabase
        .from("protocols")
        .select(
          "title, description, category, difficulty, time_commitment, protocol_tools(name, description, effectiveness_rank)"
        )
        .eq("id", protocol_id)
        .order("effectiveness_rank", { referencedTable: "protocol_tools" })
        .single();

      if (protocol) {
        const tools = (protocol as Record<string, unknown>).protocol_tools as
          | { name: string; description: string; effectiveness_rank: number }[]
          | null;
        const toolsList = tools?.length
          ? `\nKey tools/steps:\n${tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}`
          : "";
        systemPrompt +=
          `\n\nThe user is asking about the "${protocol.title}" protocol.` +
          `\nCategory: ${protocol.category} | Difficulty: ${protocol.difficulty} | Time: ${protocol.time_commitment}` +
          `\nDescription: ${protocol.description}` +
          toolsList;
      }
    }

    // [BUG 1 FIX] History already includes the saved user message from the
    // insert above, so we must NOT append it again.
    const messages: { role: "user" | "assistant"; content: string }[] = [
      ...history,
    ];

    // Stream response using SSE
    const anthropic = getAnthropicClient();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = "";
        let streamFailed = false;

        try {
          const response = anthropic.messages.stream({
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
            max_tokens: CHAT_MAX_TOKENS,
            system: systemPrompt,
            messages,
          });

          // Send meta (session_id + sources) only after stream starts successfully
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "meta", session_id: currentSessionId, sources })}\n\n`,
            ),
          );

          for await (const event of response) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const text = event.delta.text;
              fullContent += text;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "text", text })}\n\n`,
                ),
              );
            }
          }
        } catch (err) {
          streamFailed = true;
          log.error({ err }, "Stream error");
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: "Failed to generate response" })}\n\n`,
            ),
          );
        }

        // Post-stream DB cleanup — sequential to prevent inconsistent state.
        //
        // Race condition fixed (PB-132):
        //   - Previously, partial content from a failed stream was inserted as an
        //     assistant message, creating orphaned records visible in chat history.
        //   - Previously, both ops ran in parallel (Promise.allSettled), so a failed
        //     message insert still left the session timestamp updated — inconsistent.
        //
        // Invariant: assistant message is ONLY saved on clean stream completion.
        // Session timestamp is updated after — and only if — the message insert
        // succeeds, leaving a consistent "no response" state on failure.
        try {
          if (!streamFailed && fullContent) {
            // Sequential: insert message first, then update session.
            const { error: msgErr } = await supabase
              .from("chat_messages")
              .insert({ session_id: currentSessionId, role: "assistant", content: fullContent, sources });

            if (msgErr) {
              log.error({ err: msgErr }, "Failed to save assistant message — skipping session update");
            } else {
              const { error: sessionErr } = await supabase
                .from("chat_sessions")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", currentSessionId);

              if (sessionErr) {
                log.error({ err: sessionErr }, "Failed to update session timestamp");
              }
            }
          } else {
            // Stream failed or produced no content: bump session timestamp so the
            // "last active" indicator stays accurate, but save no assistant message.
            const { error: sessionErr } = await supabase
              .from("chat_sessions")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", currentSessionId);

            if (sessionErr) {
              log.error({ err: sessionErr }, "Failed to update session timestamp after stream error");
            }
          }
        } catch (cleanupErr) {
          log.error({ err: cleanupErr }, "Post-stream cleanup threw unexpectedly");
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`),
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

/** Fetch prior messages in this session to provide multi-turn context. */
async function fetchConversationHistory(
  supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"],
  sessionId: string,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    // [BUG 2 FIX] Fetch descending so limit keeps newest context, then reverse.
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_TURNS * 2);

  if (error || !data) return [];

  return data
    .filter((m) => m.content && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
    .reverse();
}

// withTimeout moved to @/lib/api/with-timeout

/** Fetch RAG context from Pinecone for the given query.
 *  If Pinecone is down or times out, returns empty context with a degradation flag. */
async function fetchRAGContext(query: string, log: Pick<typeof logger, "warn">) {
  let contextText = "";
  let sources: { type: string; title: string; chunk_id: string }[] = [];
  let ragUnavailable = false;

  try {
    const embedding = await withTimeout(
      getEmbedding(query),
      PINECONE_TIMEOUT_MS,
      "Embedding",
    );
    const matches = await withTimeout(
      queryVectors(embedding, PINECONE_TOP_K),
      PINECONE_TIMEOUT_MS,
      "Pinecone query",
    );

    sources = matches.map((m) => ({
      type: (m.metadata?.source_type as string) || "unknown",
      title: (m.metadata?.source_title as string) || "Unknown source",
      chunk_id: m.id,
    }));

    contextText = matches
      .map((m) => m.metadata?.content || "")
      .filter(Boolean)
      .join("\n\n---\n\n");
  } catch (err) {
    log.warn(
      { err },
      "RAG unavailable — continuing without vector search context",
    );
    ragUnavailable = true;
  }

  return { contextText, sources, ragUnavailable };
}

/** Build the system prompt with optional RAG context and user profile. */
function buildSystemPrompt(
  contextText: string,
  ragUnavailable: boolean,
  survey?: { focus_areas?: string[] | null; health_goals?: string[] | null },
): string {
  let prompt = `You are Craftwell, a science-based health adviser.
You provide evidence-based, practical health advice drawn from neuroscience and peer-reviewed research.

Key guidelines:
- Be practical and actionable — give specific tools and protocols
- Rank recommendations from most effective to least effective when possible
- Keep references subtle — mention "research shows" or "evidence suggests" rather than specific episode numbers
- Always include safety disclaimers for supplements, exercise, or medical topics
- If asked about something outside your knowledge, say so honestly
- Be concise but thorough`;

  // Personalise based on the user's onboarding survey
  const focusAreas = survey?.focus_areas?.filter(Boolean) ?? [];
  const healthGoals = survey?.health_goals?.filter(Boolean) ?? [];

  if (focusAreas.length > 0 || healthGoals.length > 0) {
    prompt += "\n\nUser profile (tailor your responses to their specific goals):";
    if (healthGoals.length > 0) {
      prompt += `\n- Health goals: ${healthGoals.join(", ")}`;
    }
    if (focusAreas.length > 0) {
      prompt += `\n- Primary focus areas: ${focusAreas.join(", ")}`;
    }
    prompt +=
      "\nPrioritise protocols and advice relevant to these goals. When giving recommendations, " +
      "connect them back to the user's stated objectives where appropriate.";
  }

  if (ragUnavailable) {
    prompt +=
      "\n\nNote: The knowledge base vector search is currently unavailable. " +
      "Answer based on your general training knowledge. Do not mention this limitation to the user " +
      "unless they specifically ask about source quality.";
  }

  if (contextText) {
    prompt += `\n\nRelevant context from the knowledge base:\n${contextText}`;
  }

  return prompt;
}
