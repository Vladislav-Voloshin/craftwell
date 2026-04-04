/** Public routes that don't require authentication. */
const PUBLIC_ROUTES = ["/", "/auth", "/protocols", "/privacy", "/terms", "/api/health"];

/** Static file extensions that should never be auth-gated. */
const STATIC_EXTENSIONS = [".xml", ".txt", ".json", ".ico", ".png", ".svg", ".webp"];

/** Check whether a pathname is publicly accessible (no auth required). Matches static file extensions and known public route prefixes. */
export function isPublicRoute(pathname: string): boolean {
  // Static files (robots.txt, sitemap.xml, manifest.json, etc.)
  if (STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return true;

  return PUBLIC_ROUTES.some(
    (route) =>
      pathname === route ||
      pathname.startsWith("/auth") ||
      pathname.startsWith("/protocols") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/terms")
  );
}
