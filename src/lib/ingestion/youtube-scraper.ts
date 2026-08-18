/**
 * @deprecated The former implementation copied video descriptions into the
 * RAG corpus. It remains disabled until the metadata-only YouTube evidence
 * adapter is enabled with an authorized YouTube Data API key.
 */
export async function runYouTubeScraper(): Promise<never> {
  throw new Error(
    "Legacy YouTube description ingestion is disabled. Use the metadata-only evidence pipeline."
  );
}
