/**
 * @deprecated Copying full third-party newsletters is intentionally disabled.
 * Public source metadata may be added through the evidence pipeline instead.
 */
export async function runNewsletterScraper(): Promise<never> {
  throw new Error(
    "Legacy newsletter copying is disabled. Use provenance-safe source metadata instead."
  );
}
