/**
 * Format an error into a user-friendly message.
 * formatErrorMessage(401, 'Unauthorized') => 'Authentication failed: Unauthorized'
 * formatErrorMessage(404, 'Not found') => 'Resource not found: Not found'
 * formatErrorMessage(429, 'Too many') => 'Rate limit exceeded: Too many'
 * formatErrorMessage(500, 'Server error') => 'Server error: Server error'
 * formatErrorMessage(400, 'Bad input') => 'Invalid request: Bad input'
 */
export function formatErrorMessage(statusCode: number, message: string): string {
  const statusPrefixMap: Record<number, string> = {
    400: 'Invalid request',
    401: 'Authentication failed',
    403: 'Access denied',
    404: 'Resource not found',
    429: 'Rate limit exceeded',
  };

  let prefix: string;
  if (statusCode >= 500) {
    prefix = 'Server error';
  } else if (statusCode in statusPrefixMap) {
    prefix = statusPrefixMap[statusCode];
  } else {
    prefix = 'API error';
  }

  return `${prefix}: ${message}`;
}

/**
 * Determine if an error is retryable based on status code.
 * isRetryableStatus(429) => true
 * isRetryableStatus(500) => true
 * isRetryableStatus(502) => true
 * isRetryableStatus(503) => true
 * isRetryableStatus(504) => true
 * isRetryableStatus(400) => false
 * isRetryableStatus(401) => false
 * isRetryableStatus(404) => false
 */
export function isRetryableStatus(statusCode: number): boolean {
  return [429, 500, 502, 503, 504].includes(statusCode);
}

/**
 * Get a suggested action for an error status code.
 * getSuggestedAction(401) => 'Check your API key and ensure it is valid'
 * getSuggestedAction(403) => 'Verify your account has the required permissions'
 * getSuggestedAction(404) => 'Verify the resource ID exists'
 * getSuggestedAction(429) => 'Wait and retry after the rate limit resets'
 * getSuggestedAction(500) => 'Retry the request or contact support'
 * getSuggestedAction(418) => 'Unexpected error occurred'
 */
export function getSuggestedAction(statusCode: number): string {
  const actionMap: Record<number, string> = {
    401: 'Check your API key and ensure it is valid',
    403: 'Verify your account has the required permissions',
    404: 'Verify the resource ID exists',
    429: 'Wait and retry after the rate limit resets',
    500: 'Retry the request or contact support',
  };

  return actionMap[statusCode] ?? 'Unexpected error occurred';
}

/**
 * Create a structured error object for logging.
 * toErrorLog(404, 'Not found', '/invoices/123', 'req_abc')
 * => { statusCode: 404, message: 'Not found', path: '/invoices/123', requestId: 'req_abc', retryable: false, timestamp: '...' }
 */
export function toErrorLog(
  statusCode: number,
  message: string,
  path: string,
  requestId?: string
): {
  statusCode: number;
  message: string;
  path: string;
  requestId: string | null;
  retryable: boolean;
  timestamp: string;
} {
  return {
    statusCode,
    message,
    path,
    requestId: requestId ?? null,
    retryable: isRetryableStatus(statusCode),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Categorize error by type.
 * categorizeError(401) => 'authentication'
 * categorizeError(403) => 'authorization'
 * categorizeError(404) => 'not_found'
 * categorizeError(422) => 'validation'
 * categorizeError(429) => 'rate_limit'
 * categorizeError(500) => 'server'
 * categorizeError(418) => 'unknown'
 */
export function categorizeError(statusCode: number): string {
  const categoryMap: Record<number, string> = {
    400: 'validation',
    401: 'authentication',
    403: 'authorization',
    404: 'not_found',
    422: 'validation',
    429: 'rate_limit',
  };

  if (statusCode >= 500) {
    return 'server';
  }

  return categoryMap[statusCode] ?? 'unknown';
}