// SCS-001 Pipeline Retry + Graceful Degradation
// Wraps async operations with exponential backoff retry
// Used by orchestrator stages that depend on external services (Ollama, APIs)

export interface RetryOptions {
  maxRetries:    number;
  baseDelayMs:   number;
  maxDelayMs:    number;
  retryableErrors?: string[];  // substrings to match in error messages
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries:  3,
  baseDelayMs: 1000,
  maxDelayMs:  10000,
  retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'timeout', 'fetch failed', '503', '502', '429'],
};

function isRetryable(error: Error, retryablePatterns: string[]): boolean {
  const msg = error.message.toLowerCase();
  return retryablePatterns.some(p => msg.includes(p.toLowerCase()));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err as Error;

      if (attempt >= opts.maxRetries) break;

      if (!isRetryable(lastError, opts.retryableErrors ?? [])) {
        console.warn('[retry] ' + label + ': non-retryable error — ' + lastError.message);
        break;
      }

      const backoff = Math.min(opts.baseDelayMs * Math.pow(2, attempt), opts.maxDelayMs);
      console.warn('[retry] ' + label + ': attempt ' + (attempt + 1) + '/' + opts.maxRetries +
        ' failed (' + lastError.message + '), retrying in ' + backoff + 'ms');
      await delay(backoff);
    }
  }

  throw lastError;
}

// Graceful degradation: run operation, return fallback on failure
export async function withFallback<T>(
  operation: () => Promise<T>,
  fallback: T,
  label: string,
): Promise<{ result: T; degraded: boolean }> {
  try {
    const result = await operation();
    return { result, degraded: false };
  } catch (err) {
    console.warn('[fallback] ' + label + ': degraded to fallback — ' + (err as Error).message);
    return { result: fallback, degraded: true };
  }
}
