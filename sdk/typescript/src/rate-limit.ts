/**
 * Rate limit handler for the Countable TypeScript SDK
 * Tracks API rate limits from response headers and provides wait-if-needed behavior
 */

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
}

export class RateLimitTracker {
  private info: RateLimitInfo | null = null;

  /**
   * Update rate limit info from response headers
   * Parses x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset headers
   * @param headers - Record of header names to values (case-insensitive)
   */
  update(headers: Record<string, string>): void {
    const normalizedHeaders = this.normalizeHeaders(headers);

    const limit = this.parseNumericHeader(normalizedHeaders['x-ratelimit-limit']);
    const remaining = this.parseNumericHeader(normalizedHeaders['x-ratelimit-remaining']);
    const reset = this.parseNumericHeader(normalizedHeaders['x-ratelimit-reset']);

    // All headers must be present and valid to track rate limit info
    if (limit === null || remaining === null || reset === null) {
      this.info = null;
      return;
    }

    this.info = {
      limit,
      remaining,
      resetAt: new Date(reset * 1000), // reset is Unix timestamp in seconds
    };
  }

  /**
   * Get the current rate limit info
   * @returns RateLimitInfo if available, null if no rate limit data or headers were missing
   */
  getInfo(): RateLimitInfo | null {
    return this.info;
  }

  /**
   * Check if the client should wait before making another request
   * @returns true if remaining requests <= 0, false otherwise
   */
  shouldWait(): boolean {
    if (this.info === null) {
      return false;
    }
    return this.info.remaining <= 0;
  }

  /**
   * Get the number of milliseconds to wait until the rate limit resets
   * @returns milliseconds until reset, or 0 if not rate limited or reset time has passed
   */
  getWaitMs(): number {
    if (this.info === null) {
      return 0;
    }

    const now = Date.now();
    const resetTime = this.info.resetAt.getTime();
    const waitMs = resetTime - now;

    // Return 0 if we're past the reset time or no wait is needed
    return Math.max(0, waitMs);
  }

  /**
   * Wait if the rate limit has been exceeded
   * Uses setTimeout to pause execution for the appropriate duration
   * @returns Promise that resolves after waiting, or immediately if no wait needed
   */
  async waitIfNeeded(): Promise<void> {
    if (!this.shouldWait()) {
      return;
    }

    const waitMs = this.getWaitMs();

    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
  }

  /**
   * Normalize headers to lowercase keys for case-insensitive access
   */
  private normalizeHeaders(headers: Record<string, string>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const key of Object.keys(headers)) {
      normalized[key.toLowerCase()] = headers[key];
    }
    return normalized;
  }

  /**
   * Parse a header value as a numeric value
   * @returns number if valid, null otherwise
   */
  private parseNumericHeader(value: string | undefined): number | null {
    if (value === undefined || value === '') {
      return null;
    }

    const parsed = parseInt(value, 10);

    if (isNaN(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  }

  /**
   * Sleep for the specified number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}