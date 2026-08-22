import path from "path";

/** Directory holding stored Playwright auth state (Supabase session cookies). */
export const AUTH_DIR = path.join(__dirname, "../.auth");

/**
 * Path to the stored Playwright auth state for a given parallel worker.
 *
 * Each CI run and worker gets its OWN storageState file, so retries can reuse
 * the current session without loading stale state or sharing refresh tokens.
 */
export function authFileForWorker(parallelIndex: number): string {
  const runId = (process.env.E2E_RUN_ID ?? "local").replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(AUTH_DIR, `user-${runId}-${parallelIndex}.json`);
}
