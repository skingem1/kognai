/**
 * Configuration options for a retry policy
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in milliseconds between retries */
  baseDelayMs: number;
  /** Maximum delay in milliseconds between retries */
  maxDelayMs: number;
  /** Function to determine if an error should trigger a retry */
  shouldRetry: (error: { status?: number; code?: string }) => boolean;
}

/** Default retryable HTTP status codes */
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/** Default retryable network error codes */
const RETRYABLE_ERROR_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];

/**
 * Default shouldRetry function that retries on common server errors and network failures
 * @param error - The error object containing status code or error code
 * @returns True if the error should be retried
 */
const defaultShouldRetry = (error: { status?: number; code?: string }): boolean => {
  const status = error.status;
  const code = error.code;
  return (status !== undefined && RETRYABLE_STATUS_CODES.includes(status)) ||
         (code !== undefined && RETRYABLE_ERROR_CODES.includes(code));
};

/**
 * Creates a new retry policy with optional configuration overrides.
 * @param options - Optional partial retry policy configuration
 * @returns A complete RetryPolicy object with defaults applied
 */
export function createRetryPolicy(options?: Partial<RetryPolicy>): RetryPolicy {
  return {
    maxRetries: options?.maxRetries ?? 3,
    baseDelayMs: options?.baseDelayMs ?? 1000,
    maxDelayMs: options?.maxDelayMs ?? 30000,
    shouldRetry: options?.shouldRetry ?? defaultShouldRetry,
  };
}

/**
 * Calculates the delay before the next retry attempt using exponential backoff with jitter.
 * @param attempt - The current retry attempt number (0-indexed)
 * @param policy - The retry policy to use for calculating delay
 * @returns The delay in milliseconds (floored integer)
 */
export function calculateDelay(attempt: number, policy: RetryPolicy): number {
  const expDelay = policy.baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(expDelay, policy.maxDelayMs);
  const jitter = 0.5 + Math.random();
  return Math.floor(cappedDelay * jitter);
}

/**
 * Determines if an error is retryable based on the provided retry policy.
 * @param error - The error object containing status code or error code
 * @param policy - The retry policy to use for evaluation
 * @returns True if the error should trigger a retry attempt
 */
export function isRetryableError(error: { status?: number; code?: string }, policy: RetryPolicy): boolean {
  return policy.shouldRetry(error);
}

/**
 * Predefined retry policies for common use cases.
 */
export const RETRY_POLICIES: Record<string, RetryPolicy> = {
  aggressive: {
    maxRetries: 5,
    baseDelayMs: 500,
    maxDelayMs: 60000,
    shouldRetry: defaultShouldRetry,
  },
  conservative: {
    maxRetries: 2,
    baseDelayMs: 2000,
    maxDelayMs: 10000,
    shouldRetry: defaultShouldRetry,
  },
  none: {
    maxRetries: 0,
    baseDelayMs: 0,
    maxDelayMs: 0,
    shouldRetry: () => false,
  },
};