import { withTimeout } from './timeout';
import { retryWithBackoff } from './retry';
import { buildUrl, buildHeaders } from './request-builder';
import { parseResponse } from './response-parser';

export class HttpTransport {
  constructor(
    private config: { baseUrl: string; apiKey: string; timeout: number; maxRetries: number }
  ) {}

  async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = buildUrl(this.config.baseUrl, path);
    const headers = buildHeaders(this.config.apiKey);
    const hasBody = body != null && method !== 'GET' && method !== 'DELETE';

    const fetchWithRetry = async (): Promise<T> => {
      try {
        const fetchFn = async (): Promise<T> => {
          const response = await fetch(url, {
            method,
            headers: {
              ...headers,
              ...(hasBody ? { 'Content-Type': 'application/json' } : {})
            },
            ...(hasBody ? { body: JSON.stringify(body) } : {})
          });
          return parseResponse<T>(response);
        };
        return await withTimeout(fetchFn(), this.config.timeout);
      } catch (error) {
        throw error;
      }
    };

    return retryWithBackoff(fetchWithRetry, { maxRetries: this.config.maxRetries });
  }
}