export interface RequestConfig {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>
): string {
  const url = new URL(baseUrl + path);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

export function buildHeaders(
  apiKey: string,
  extra?: Record<string, string>
): Record<string, string> {
  return {
    Authorization: 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    'User-Agent': 'countable-sdk/1.0.0',
    ...extra,
  };
}