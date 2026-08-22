const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface EvidenceFetchOptions {
  retries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export async function fetchEvidenceUrl(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  options: EvidenceFetchOptions = {}
): Promise<Response> {
  const retries = Math.min(Math.max(options.retries ?? 2, 0), 5);
  const timeoutMs = options.timeoutMs ?? 20_000;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 5_000;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === retries) return response;
      await delay(retryDelay(response, attempt, baseDelayMs, maxDelayMs));
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
      await delay(Math.min(baseDelayMs * 2 ** attempt, maxDelayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Evidence request failed");
}

function retryDelay(
  response: Response,
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1_000, 0), maxDelayMs);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), maxDelayMs);
  }
  return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
