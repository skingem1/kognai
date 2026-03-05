/**
 * Parse URL search string into key-value pairs.
 * @param search - URL search string (with or without leading '?')
 * @returns Record of parsed key-value pairs
 */
export function parseParams(search: string): Record<string, string> {
  const params: Record<string, string> = {};
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (!query) return params;
  for (const pair of query.split('&')) {
    const [key, value] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
  }
  return params;
}

/**
 * Build URL search string from params object.
 * @param params - Object containing key-value pairs
 * @returns URL search string (without leading '?')
 */
export function buildParams(params: Record<string, string | number | boolean>): string {
  return Object.entries(params)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

/**
 * Parse base string and merge with overrides.
 * @param base - Base URL search string
 * @param overrides - Params to merge
 * @returns Merged URL search string
 */
export function mergeParams(base: string, overrides: Record<string, string>): string {
  return buildParams({ ...parseParams(base), ...overrides });
}

/**
 * Remove a parameter from URL search string.
 * @param search - URL search string
 * @param key - Key to remove
 * @returns Updated URL search string
 */
export function removeParam(search: string, key: string): string {
  const params = parseParams(search);
  delete params[key];
  return buildParams(params);
}