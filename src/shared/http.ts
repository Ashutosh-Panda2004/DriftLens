// DriftLens - HTTP helper with timeout support.
//
// Every outbound call to an LLM or embedding provider goes through here. The
// native `fetch` has no default timeout, so a hung provider (network stall,
// overloaded endpoint, dropped connection) would otherwise block `analyse` /
// `propose` indefinitely with no way to recover. We wrap each request in an
// AbortController so callers fail fast and can fall back to rule-based analysis.

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * `fetch` with a hard timeout. Aborts the request after `timeoutMs` and throws
 * a descriptive error rather than hanging forever. Always clears the timer.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      let host = url;
      try {
        host = new URL(url).host;
      } catch {
        // keep raw url if it cannot be parsed
      }
      throw new Error(`Request to ${host} timed out after ${String(timeoutMs)}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
