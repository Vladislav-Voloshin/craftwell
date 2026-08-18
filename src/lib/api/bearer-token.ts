import { timingSafeEqual } from "node:crypto";

/** Compare server-side bearer credentials without content-dependent timing. */
export function hasValidBearerToken(authorization: string | null, expected: string): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice(7), "utf8");
  const configured = Buffer.from(expected, "utf8");
  return provided.length === configured.length && timingSafeEqual(provided, configured);
}
