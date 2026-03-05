/**
 * Header utility module for the Invoica SDK.
 * Pure functions for building and parsing HTTP headers used in API requests.
 */

/**
 * SDK version string used in requests.
 */
const SDK_VERSION = '1.0.0';

/**
 * Build standard Invoica API request headers.
 * @param apiKey - The API key for authentication
 * @param extra - Optional extra headers to include
 * @returns Record containing standard headers with optional extras
 */
export function buildHeaders(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-SDK-Version': SDK_VERSION,
  };

  if (extra) {
    return { ...headers, ...extra };
  }

  return headers;
}

/**
 * Parse a retry-after header value to milliseconds.
 * @param value - The retry-after header value (seconds or HTTP date)
 * @returns Milliseconds until retry, or null if invalid/missing
 */
export function parseRetryAfter(value: string | null): number | null {
  if (value === null || value === '' || value === undefined) {
    return null;
  }

  // Check if it's a numeric string (seconds)
  if (/^\d+$/.test(value)) {
    const seconds = parseInt(value, 10);
    return seconds * 1000;
  }

  // Try to parse as HTTP date
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date.getTime() - Date.now();
  }

  return null;
}

/**
 * Extract rate limit info from response headers.
 * @param headers - Record of response headers (keys should be lowercase)
 * @returns Rate limit info object or null if headers are missing
 */
export function extractRateLimitInfo(headers: Record<string, string>): { limit: number; remaining: number; resetAt: Date } | null {
  const limitHeader = headers['x-ratelimit-limit'];
  const remainingHeader = headers['x-ratelimit-remaining'];
  const resetHeader = headers['x-ratelimit-reset'];

  if (limitHeader === undefined || remainingHeader === undefined || resetHeader === undefined) {
    return null;
  }

  const limit = parseInt(limitHeader, 10);
  const remaining = parseInt(remainingHeader, 10);
  const resetTimestamp = parseInt(resetHeader, 10);

  if (isNaN(limit) || isNaN(remaining) || isNaN(resetTimestamp)) {
    return null;
  }

  return {
    limit,
    remaining,
    resetAt: new Date(resetTimestamp * 1000),
  };
}

/**
 * Build idempotency key header.
 * @param key - Optional idempotency key
 * @returns Object with Idempotency-Key header if key provided, else empty object
 */
export function buildIdempotencyHeader(key?: string): Record<string, string> {
  if (key === undefined || key === '') {
    return {};
  }

  return { 'Idempotency-Key': key };
}

/**
 * Merge multiple header objects (later objects override earlier).
 * @param headerSets - Variable number of header records to merge
 * @returns Merged header object
 */
export function mergeHeaders(...headerSets: Record<string, string>[]): Record<string, string> {
  return Object.assign({}, ...headerSets);
}