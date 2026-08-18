/**
 * @deprecated Raw PubMed abstract ingestion is intentionally disabled.
 * Use the provenance-safe evidence pipeline, which stores citation metadata
 * and marks guest-author matches as reviewable candidates.
 */
export async function runGuestResearchScraper(): Promise<never> {
  throw new Error(
    "Legacy guest research scraping is disabled. Use /api/ingest with weekly-evidence or backfill-guest-research."
  );
}
