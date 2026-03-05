/**
 * Type definitions for webhook retry functionality
 */

/**
 * Configuration for webhook retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Delay in milliseconds between retry attempts (default: [1000, 5000, 15000]) */
  delays: number[];
}

/**
 * Result of webhook retry attempts
 */
export interface RetryResult {
  /** Whether the webhook was successfully delivered */
  success: boolean;
  /** Number of attempts made */
  attempts: number;
  /** Last error encountered, if any */
  error: Error | null;
  /** Last response received from the webhook endpoint */
  lastResponse: any;
}

/**
 * Webhook payload data structure
 */
export interface WebhookPayload {
  /** Event type identifier */
  event: string;
  /** Event data payload */
  data: Record<string, any>;
  /** Timestamp when the event occurred */
  timestamp: string;
  /** Unique identifier for this webhook delivery attempt */
  deliveryId: string;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  delays: [1000, 5000, 15000],
};