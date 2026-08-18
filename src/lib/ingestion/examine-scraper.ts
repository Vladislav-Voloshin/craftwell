/**
 * Examine content requires a separate data licence for automated retention,
 * redistribution, or model use. Keep this entry point disabled until that
 * licence is documented and the licensed API adapter is implemented.
 */
export async function runExamineScraper(): Promise<never> {
  throw new Error("Examine ingestion is disabled until an appropriate data licence is configured.");
}
