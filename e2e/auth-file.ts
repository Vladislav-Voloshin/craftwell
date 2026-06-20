import path from "path";

/** Directory holding stored Playwright auth state (Supabase session cookies). */
export const AUTH_DIR = path.join(__dirname, "../.auth");

/**
 * Path to the stored Playwright auth state for a given parallel worker.
 *
 * Each worker signs in as its OWN test account and gets its OWN storageState
 * file, so Supabase refresh-token rotation in one worker can't invalidate
 * another worker's session (the root cause of the `full`-suite flakiness).
 */
export function authFileForWorker(workerIndex: number): string {
  return path.join(AUTH_DIR, `user-${workerIndex}.json`);
}
