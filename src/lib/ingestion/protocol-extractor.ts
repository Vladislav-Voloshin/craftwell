/**
 * Protocol Extractor
 *
 * Uses Claude to analyze ingested content and extract structured protocols
 * with ranked tools. This is the core value of the app — turning unstructured
 * podcast/newsletter content into actionable, ranked protocol toolkits.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin as getSupabase } from "./shared";
import { serverEnv } from "@/lib/env";
import logger from "@/lib/logger";

function getAnthropic() {
  return new Anthropic({
    apiKey: serverEnv().ANTHROPIC_API_KEY,
  });
}

interface ExtractedProtocol {
  title: string;
  slug: string;
  category: string;
  description: string;
  difficulty: "easy" | "moderate" | "advanced";
  time_commitment: string;
  tags: string[];
  tools: {
    title: string;
    description: string;
    instructions: string;
    effectiveness_rank: number;
    timing?: string;
    duration?: string;
    frequency?: string;
    notes?: string;
    sources?: { label: string; url: string }[];
  }[];
}

const VALID_CATEGORIES = [
  "sleep",
  "focus",
  "exercise",
  "stress",
  "nutrition",
  "hormones",
  "cold-heat",
  "light",
  "motivation",
  "mental-health",
];

/**
 * Extract protocols from a batch of content chunks using Claude
 */
export async function extractProtocolsFromContent(
  topic: string,
  chunks: { content: string; source_title: string }[]
): Promise<ExtractedProtocol[]> {
  const anthropic = getAnthropic();
  const combinedContent = chunks
    .map((c) => `--- ${c.source_title} ---\n${c.content}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `You are a health protocol extraction system. Your job is to analyze content from science-based health sources and extract structured, actionable health protocols.

Each protocol is a toolkit for solving a specific health problem (e.g., "Improve Sleep Quality", "Reduce Stress Quickly").
Each protocol contains TOOLS ranked from most effective to least effective.

Guidelines:
- Be specific and actionable
- Include dosages, timings, and frequencies where mentioned
- Rank tools by effectiveness (1 = most effective)
- Use simple language
- Include safety notes for supplements
- Categories must be one of: ${VALID_CATEGORIES.join(", ")}
- Slugs must be lowercase-kebab-case
- For each tool, include real evidence sources (PubMed articles, Examine.com pages, journal papers) with working URLs
- PubMed URLs should use format: https://pubmed.ncbi.nlm.nih.gov/{PMID}/
- Examine.com URLs should use format: https://examine.com/supplements/{supplement-name}/
- Only include URLs you are confident are real and accessible`,
    messages: [
      {
        role: "user",
        content: `Analyze the following content about "${topic}" and extract structured health protocols.

Content:
${combinedContent.slice(0, 8000)}

Return a JSON array of protocols. Each protocol should have:
- title: Clear name like "Optimize Sleep Quality" or "Morning Focus Protocol"
- slug: kebab-case URL slug
- category: one of [${VALID_CATEGORIES.join(", ")}]
- description: 1-2 sentence description
- difficulty: easy | moderate | advanced
- time_commitment: e.g. "5-10 min/day", "30 min 3x/week"
- tags: relevant keyword tags
- tools: array of individual tools, each with:
  - title: tool name
  - description: what it does
  - instructions: step-by-step how to do it
  - effectiveness_rank: 1 = most effective
  - timing: when to do it (optional)
  - duration: how long (optional)
  - frequency: how often (optional)
  - notes: safety info or tips (optional)
  - sources: array of evidence links, each with:
    - label: short description (e.g., "PubMed: Melatonin and sleep quality meta-analysis")
    - url: full URL to PubMed, Examine.com, or journal article

Return ONLY valid JSON array, no other text.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.error("No JSON array found in protocol extraction response");
      return [];
    }
    return JSON.parse(jsonMatch[0]) as ExtractedProtocol[];
  } catch (err) {
    logger.error({ err }, "Error parsing protocol JSON");
    return [];
  }
}

/**
 * Store extracted protocols in Supabase
 */
export async function storeProtocols(protocols: ExtractedProtocol[]) {
  const supabase = getSupabase();
  let stored = 0;

  for (const protocol of protocols) {
    // Validate category
    if (!VALID_CATEGORIES.includes(protocol.category)) {
      logger.warn({ category: protocol.category, title: protocol.title }, "Invalid protocol category, skipping");
      continue;
    }

    // Insert protocol
    const { data: inserted, error } = await supabase
      .from("protocols")
      .upsert(
        {
          title: protocol.title,
          slug: protocol.slug,
          category: protocol.category,
          description: protocol.description,
          effectiveness_rank: stored + 1,
          difficulty: protocol.difficulty,
          time_commitment: protocol.time_commitment,
          tags: protocol.tags,
          source_type: "podcast",
        },
        { onConflict: "slug" }
      )
      .select("id")
      .single();

    if (error || !inserted) {
      logger.error({ err: error, title: protocol.title }, "Error storing protocol");
      continue;
    }

    // Insert tools
    for (const tool of protocol.tools) {
      // Append evidence sources to notes field
      let notes = tool.notes || "";
      if (tool.sources && tool.sources.length > 0) {
        const sourcesBlock = tool.sources
          .map((s) => `[${s.label}](${s.url})`)
          .join("\n");
        notes = notes
          ? `${notes}\n\n**Evidence:**\n${sourcesBlock}`
          : `**Evidence:**\n${sourcesBlock}`;
      }

      const { error: toolError } = await supabase
        .from("protocol_tools")
        .insert({
          protocol_id: inserted.id,
          title: tool.title,
          description: tool.description,
          instructions: tool.instructions,
          effectiveness_rank: tool.effectiveness_rank,
          timing: tool.timing,
          duration: tool.duration,
          frequency: tool.frequency,
          notes,
        });

      if (toolError) {
        logger.error({ err: toolError, title: tool.title }, "Error storing protocol tool");
      }
    }

    stored++;
    logger.info({ title: protocol.title, tools: protocol.tools.length }, "Stored protocol");
  }

  return stored;
}

/**
 * Run extraction for all major health topics
 */
export async function runProtocolExtraction() {
  const supabase = getSupabase();
  const topics = [
    "sleep optimization and sleep quality",
    "focus and concentration improvement",
    "exercise performance and recovery",
    "stress management and anxiety reduction",
    "nutrition and supplementation",
    "hormonal health and optimization",
    "cold exposure and heat therapy",
    "light exposure and circadian rhythm",
    "motivation dopamine and habit formation",
    "mental health depression and mood",
  ];

  let totalProtocols = 0;

  for (const topic of topics) {
    logger.info({ topic }, "Extracting protocols for topic");

    // Get relevant chunks from the database
    const { data: chunks } = await supabase
      .from("content_chunks")
      .select("content, source_title")
      .ilike("content", `%${topic.split(" ")[0]}%`)
      .limit(20);

    if (!chunks || chunks.length === 0) {
      logger.info({ topic }, "No content found, skipping");
      continue;
    }

    const protocols = await extractProtocolsFromContent(topic, chunks);
    const stored = await storeProtocols(protocols);
    totalProtocols += stored;

    // Rate limiting
    await new Promise((r) => setTimeout(r, 2000));
  }

  logger.info({ totalProtocols }, "Protocol extraction complete");
  return totalProtocols;
}
