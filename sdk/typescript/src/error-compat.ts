import { InvoicaError } from './errors';

/**
 * Backward-compatible alias for InvoicaError
 * @public
 */
const CountableError = InvoicaError;

/**
 * Error class for rate limit exceeded scenarios
 * @public
 */
class RateLimitError extends InvoicaError {
  retryAfter: number;

  constructor(message: string, retryAfter?: number) {
    super(message, 429, 'RATE_LIMIT');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter || 0;
  }
}

export { CountableError, RateLimitError };
export { InvoicaError };