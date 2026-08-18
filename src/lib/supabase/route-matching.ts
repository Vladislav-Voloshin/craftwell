/** Exact public routes that don't require authentication. */
const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/privacy",
  "/terms",
  "/offline",
  "/sw.js",
  "/api/health",
  "/api/waitlist",
  // These endpoints authenticate requests with provider signatures/secrets.
  "/api/stripe/webhook",
  "/api/revenuecat/webhook",
  "/api/ingest",
  "/api/cron/weekly-ingestion",
];

/** Public route families whose nested pages must also remain accessible. */
const PUBLIC_PREFIXES = ["/auth", "/protocols"];

/** Static file extensions that should never be auth-gated. */
const STATIC_EXTENSIONS = [".xml", ".txt", ".json", ".ico", ".png", ".svg", ".webp"];

/** Check whether a pathname is publicly accessible (no auth required). Matches static file extensions and known public route prefixes. */
export function isPublicRoute(pathname: string): boolean {
  // Static files (robots.txt, sitemap.xml, manifest.json, etc.)
  if (STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return true;

  if (PUBLIC_ROUTES.includes(pathname)) return true;

  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
