export interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoff?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Executes a function with retry logic and optional exponential backoff.
 * @param fn - The async function to execute.
 * @param options - Retry configuration options.
 * @returns The result of the function.
 * @throws The last error if all retry attempts fail.
 */
export async function retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const { maxAttempts = 3, delay = 1000, backoff = 1, onRetry } = options || {};
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      if (attempt === maxAttempts) throw lastError;
      if (onRetry) onRetry(lastError, attempt);
      await new Promise(r => setTimeout(r, delay * Math.pow(backoff, attempt - 1)));
    }
  }
  throw lastError;
}