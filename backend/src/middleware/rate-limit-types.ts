/**
 * Rate limiting types and constants for API request throttling
 */

/**
 * Rate limit configuration for a specific tier
 */
export interface RateLimitTier {
  /** Maximum number of requests allowed in the time window */
  requests: number;
  /** Time window for rate limiting (e.g., '1h', '15m', '1d') */
  window: string;
}

/**
 * Available rate limit tier names
 */
export type TierName = 'free' | 'paid';

/**
 * Rate limit tier definitions
 */
export const RATE_LIMIT_TIERS: Record<TierName, RateLimitTier> = {
  free: {
    requests: 100,
    window: '1h'
  },
  paid: {
    requests: 1000,
    window: '1h'
  }
} as const;