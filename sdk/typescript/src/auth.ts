import { randomUUID, createHmac } from 'crypto';

/**
 * Creates authentication headers for API requests.
 * @param apiKey - The API key for authentication
 * @returns Record containing Authorization, X-Request-Id, and X-Timestamp headers
 */
export function createAuthHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'X-Request-Id': randomUUID(),
    'X-Timestamp': new Date().toISOString(),
  };
}

/**
 * Validates an API key format.
 * @param key - The API key to validate
 * @returns true if the key matches the expected format, false otherwise
 */
export function validateApiKey(key: string): boolean {
  return /^inv_[0-9a-f]{32}$/.test(key);
}

/**
 * Creates an HMAC-SHA256 signature for request verification.
 * @param apiKey - The API key used as the HMAC secret
 * @param method - The HTTP method
 * @param path - The request path
 * @param body - Optional request body
 * @returns Hex digest of the HMAC-SHA256 signature
 */
export function signRequest(apiKey: string, method: string, path: string, body?: string): string {
  const hmac = createHmac('sha256', apiKey);
  hmac.update(`${method}:${path}:${body || ''}`);
  return hmac.digest('hex');
}

/**
 * Error class for API key related errors.
 */
export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyError';
  }
}
