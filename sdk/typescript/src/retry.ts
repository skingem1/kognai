/**
 * Retry utility with exponential backoff and jitter
 * @packageDocumentation
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  retryableStatuses?: number[];
}

// Internal constants
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 200;
const DEFAULT_MAX_DELAY_MS = 5000;
const DEFAULT_RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];
const JITTER_MAX_MS = 50;

/**
 * Generates a random jitter value between 0 and maxJitterMs (inclusive)
 * @param maxJitterMs - Maximum jitter in milliseconds
 * @returns Random jitter value
 */
function getJitter(maxJitterMs: number = JITTER_MAX_MS): number {
  return Math.floor(Math.random() * (maxJitterMs + 1));
}

/**
 * Checks if an error is retryable based on HTTP status code
 * @param error - The error to check
 * @param retryableStatuses - Array of retryable HTTP status codes
 * @returns true if the error should be retried
 */
function isRetryableError(error: unknown, retryableStatuses: number[]): boolean {
  if (error === null || error === undefined) {
    return false;
  }

  // Handle errors with status property (e.g., HTTP errors)
  if (typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' && retryableStatuses.includes(status);
  }

  return false;
}

/**
 * Executes a function with exponential backoff retry logic
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns Promise resolving to the result of fn
 * @throws Re-throws the last error if all retries are exhausted or error is not retryable
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialDelayMs = options?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const retryableStatuses = options?.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt < maxRetries) {
        if (isRetryableError(error, retryableStatuses)) {
          // Calculate exponential backoff: min(initialDelayMs * 2^attempt, maxDelayMs)
          const exponentialDelay = initialDelayMs * Math.pow(2, attempt);
          const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
          
          // Add jitter (0-50ms)
          const jitter = getJitter();
          const totalDelay = cappedDelay + jitter;

          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, totalDelay));
          continue;
        }
      }

      // Either no more retries or error is not retryable - throw the error
      throw error;
    }
  }

  // This should never be reached, but TypeScript needs a return
  throw lastError;
}