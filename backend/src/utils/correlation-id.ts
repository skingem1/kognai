/**
 * Correlation ID Utility Module
 * Manages request correlation IDs for distributed tracing
 */

/**
 * HTTP header name for correlation ID
 */
export const CORRELATION_HEADER = 'x-correlation-id' as const;

/**
 * Generates a unique correlation ID
 * Format: cid_<timestamp>_<random>
 * @returns A unique correlation ID string
 */
export function generateCorrelationId(): string {
  return 'cid_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

/**
 * Extracts correlation ID from HTTP headers
 * @param headers - Request headers object
 * @returns The correlation ID from headers, or a newly generated one if not present
 */
export function extractCorrelationId(headers: Record<string, string | string[] | undefined>): string {
  const value = headers[CORRELATION_HEADER];

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  return generateCorrelationId();
}

/**
 * Context object containing correlation tracking information
 */
export interface CorrelationContext {
  correlationId: string;
  parentId?: string;
  spanId?: string;
}

/**
 * Creates a new correlation context
 * @param correlationId - The correlation ID for this request
 * @param parentId - Optional parent correlation ID for tracing
 * @returns A CorrelationContext object with a new spanId
 */
export function createContext(correlationId: string, parentId?: string): CorrelationContext {
  return {
    correlationId,
    parentId,
    spanId: generateCorrelationId(),
  };
}