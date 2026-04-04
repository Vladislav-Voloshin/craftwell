/**
 * Content Chunking Pipeline
 *
 * Takes raw content (transcripts, newsletters, book text) and chunks it
 * into optimal pieces for vector embedding and RAG retrieval.
 */

import { getSupabaseAdmin as getSupabase } from "./shared";
import logger from "@/lib/logger";

interface ChunkInput {
  source_type: "podcast" | "newsletter" | "book" | "research" | "supplement";
  source_title: string;
  source_id: string;
  content: string;
  metadata?: Record<string, string>;
}

interface ContentChunk {
  source_type: string;
  source_title: string;
  source_id: string;
  content: string;
  metadata: Record<string, string>;
}

const CHUNK_SIZE = 1000; // ~1000 chars per chunk
const CHUNK_OVERLAP = 200; // 200 char overlap between chunks

/**
 * Split text into overlapping chunks at sentence boundaries
 */
export function chunkText(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Start new chunk with overlap from end of previous
      const overlapStart = Math.max(0, currentChunk.length - CHUNK_OVERLAP);
      currentChunk = currentChunk.slice(overlapStart) + sentence;
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Process a content source into chunks and store in Supabase
 */
export async function processAndStoreChunks(input: ChunkInput): Promise<number> {
  const supabase = getSupabase();
  const textChunks = chunkText(input.content);
  const chunks: ContentChunk[] = textChunks.map((text, index) => ({
    source_type: input.source_type,
    source_title: input.source_title,
    source_id: input.source_id,
    content: text,
    metadata: {
      ...input.metadata,
      chunk_index: String(index),
      total_chunks: String(textChunks.length),
    },
  }));

  const batchSize = 50;
  let stored = 0;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const { error } = await supabase.from("content_chunks").insert(batch);

    if (error) {
      logger.error({ err: error, batch: i }, "Error storing chunk batch");
    } else {
      stored += batch.length;
    }
  }

  return stored;
}

/**
 * Process all un-ingested podcast episodes
 */
export async function chunkPodcastEpisodes() {
  const supabase = getSupabase();
  const { data: episodes } = await supabase
    .from("podcast_episodes")
    .select("*")
    .eq("ingested", false)
    .not("transcript", "is", null);

  if (!episodes || episodes.length === 0) {
    logger.info("No un-ingested episodes with transcripts found");
    return 0;
  }

  let totalChunks = 0;

  for (const episode of episodes) {
    const content = `${episode.title}\n\n${episode.description}\n\n${episode.transcript}`;
    const stored = await processAndStoreChunks({
      source_type: "podcast",
      source_title: episode.title,
      source_id: episode.id,
      content,
      metadata: {
        episode_number: String(episode.episode_number),
        publish_date: episode.publish_date || "",
        guests: (episode.guests || []).join(", "),
      },
    });

    await supabase
      .from("podcast_episodes")
      .update({ ingested: true })
      .eq("id", episode.id);

    totalChunks += stored;
    logger.info({ title: episode.title, chunks: stored }, "Chunked episode");
  }

  return totalChunks;
}

/**
 * Process all un-ingested newsletters
 */
export async function chunkNewsletters() {
  const supabase = getSupabase();
  const { data: newsletters } = await supabase
    .from("newsletters")
    .select("*")
    .eq("ingested", false);

  if (!newsletters || newsletters.length === 0) {
    logger.info("No un-ingested newsletters found");
    return 0;
  }

  let totalChunks = 0;

  for (const nl of newsletters) {
    const content = `${nl.title}\n\n${nl.content}`;
    const stored = await processAndStoreChunks({
      source_type: "newsletter",
      source_title: nl.title,
      source_id: nl.id,
      content,
      metadata: {
        publish_date: nl.publish_date || "",
        topics: (nl.topics || []).join(", "),
      },
    });

    await supabase
      .from("newsletters")
      .update({ ingested: true })
      .eq("id", nl.id);

    totalChunks += stored;
    logger.info({ title: nl.title, chunks: stored }, "Chunked newsletter");
  }

  return totalChunks;
}
