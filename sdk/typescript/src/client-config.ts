/**
 * Invoica SDK Client Configuration Module
 * 
 * Centralizes SDK configuration with sensible defaults for the Invoica API client.
 * @packageDocumentation
 */

/**
 * Input configuration interface for InvoicaClient.
 * All properties except apiKey are optional and will be resolved with defaults.
 */
export interface InvoicaClientConfig {
  /** API key for authenticating with the Invoica API. Required. */
  apiKey: string;
  
  /** Base URL for the Invoica API. Defaults to production API endpoint. */
  baseUrl?: string;
  
  /** Request timeout in milliseconds. Defaults to 30000ms (30 seconds). */
  timeout?: number;
  
  /** Maximum number of retry attempts for failed requests. Defaults to 3. */
  maxRetries?: number;
}

/**
 * Resolved configuration interface with all required properties.
 * Returned by resolveConfig() after applying defaults.
 */
export interface ResolvedConfig {
  /** API key for authenticating with the Invoica API. */
  apiKey: string;
  
  /** Base URL for the Invoica API. */
  baseUrl: string;
  
  /** Request timeout in milliseconds. */
  timeout: number;
  
  /** Maximum number of retry attempts for failed requests. */
  maxRetries: number;
}

/**
 * Default base URL for the Invoica API.
 * Points to the production API endpoint.
 */
export const DEFAULT_BASE_URL = 'https://api.invoica.ai/v1';

/**
 * Default request timeout in milliseconds.
 * Set to 30 seconds.
 */
export const DEFAULT_TIMEOUT = 30000;

/**
 * Default maximum number of retry attempts.
 * Used for idempotent operations that can be safely retried.
 */
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Resolves a partial client configuration by applying default values.
 * 
 * @param config - The partial client configuration
 * @returns A fully resolved configuration with all defaults applied
 * @throws Error if apiKey is not provided or is empty
 * 
 * @example
 * ```typescript
 * const config = resolveConfig({
 *   apiKey: 'your-api-key',
 *   timeout: 60000
 * });
 * // Returns: { apiKey: 'your-api-key', baseUrl: 'https://api.invoica.ai/v1', timeout: 60000, maxRetries: 3 }
 * ```
 */
export function resolveConfig(config: InvoicaClientConfig): ResolvedConfig {
  if (!config.apiKey || config.apiKey.trim() === '') {
    throw new Error('InvoicaClientConfig: apiKey is required and cannot be empty');
  }

  return {
    apiKey: config.apiKey.trim(),
    baseUrl: config.baseUrl || DEFAULT_BASE_URL,
    timeout: config.timeout || DEFAULT_TIMEOUT,
    maxRetries: config.maxRetries || DEFAULT_MAX_RETRIES,
  };
}