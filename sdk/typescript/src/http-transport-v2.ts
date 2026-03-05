import { withTimeout } from './timeout';
import { retryWithBackoff } from './retry';
import { buildUrl, buildHeaders } from './request-builder';
import { parseResponse } from './response-parser-v2';

export interface TransportRequestConfig {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export class HttpTransport {
  constructor(
    private config: { baseUrl: string; apiKey: string; timeout: number; maxRetries: number }
  ) {}

  async request<T>(reqConfig: TransportRequestConfig): Promise<T> {
    const { method, path, body, query } = reqConfig;
    const url = buildUrl(this.config.baseUrl, path, query);
    const headers = buildHeaders(this.config.apiKey);
    const hasBody = body != null && method !== 'GET' && method !== 'DELETE';

    const doFetch = async (): Promise<T> => {
      const fetchFn = async (): Promise<T> => {
        const response = await fetch(url, {
          method,
          headers: { ...headers, ...(hasBody ? { 'Content-Type': 'application/json' } : {}) },
          ...(hasBody ? { body: JSON.stringify(body) } : {}),
        });
        return parseResponse<T>(response);
      };
      return withTimeout(fetchFn(), this.config.timeout);
    };

    return retryWithBackoff(doFetch, { maxRetries: this.config.maxRetries });
  }
}