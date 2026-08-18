/**
 * @deprecated Raw abstract ingestion is intentionally disabled.
 * The replacement stores only PubMed citation metadata and canonical links.
 */
export async function runPubMedScraper(): Promise<never> {
  throw new Error(
    "Legacy PubMed scraping is disabled. Use /api/ingest with weekly-evidence or backfill-recent-research."
  );
}
