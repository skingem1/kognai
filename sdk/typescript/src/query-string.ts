/**
 * URL Query String Utilities
 * Pure functions for building, parsing, and appending query parameters
 * No external dependencies
 */

/**
 * Converts an object to a URL query string (without leading '?').
 * Skips undefined and null values.
 * Encodes keys and values with encodeURIComponent.
 *
 * @param params - Record of query parameters
 * @returns Query string without leading '?'
 * @example
 * buildQuery({ status: 'active', page: 1 }) // 'status=active&page=1'
 * buildQuery({ a: 'hello world', b: undefined }) // 'a=hello%20world'
 * buildQuery({}) // ''
 */
export function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>
): string {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null
  );

  if (entries.length === 0) {
    return '';
  }

  return entries
    .map(([key, value]) => {
      const encodedKey = encodeURIComponent(key);
      const encodedValue = encodeURIComponent(String(value));
      return `${encodedKey}=${encodedValue}`;
    })
    .join('&');
}

/**
 * Parses a URL query string to an object.
 * Handles leading '?' (strips it if present).
 * Decodes keys and values with decodeURIComponent.
 * Handles keys with no value as empty strings.
 *
 * @param queryString - URL query string (with or without leading '?')
 * @returns Record of parsed query parameters
 * @example
 * parseQuery('status=active&page=1') // { status: 'active', page: '1' }
 * parseQuery('?a=hello%20world') // { a: 'hello world' }
 * parseQuery('foo&bar=1') // { foo: '', bar: '1' }
 * parseQuery('') // {}
 */
export function parseQuery(queryString: string): Record<string, string> {
  const trimmed = queryString.trim();

  if (!trimmed) {
    return {};
  }

  // Strip leading '?' if present
  const withoutQuestionMark = trimmed.startsWith('?')
    ? trimmed.slice(1)
    : trimmed;

  if (!withoutQuestionMark) {
    return {};
  }

  const result: Record<string, string> = {};

  const pairs = withoutQuestionMark.split('&');

  for (const pair of pairs) {
    if (!pair) {
      continue;
    }

    const eqIndex = pair.indexOf('=');
    let key: string;
    let value: string;

    if (eqIndex === -1) {
      // No '=' found - key with no value
      key = pair;
      value = '';
    } else if (eqIndex === 0) {
      // '=' at start - skip this segment
      continue;
    } else {
      // Normal key=value
      key = pair.slice(0, eqIndex);
      // Handle multiple '=' by joining the rest back
      value = pair.slice(eqIndex + 1);
    }

    const decodedKey = decodeURIComponent(key);
    const decodedValue = decodeURIComponent(value);

    result[decodedKey] = decodedValue;
  }

  return result;
}

/**
 * Appends query params to existing URL.
 * If URL already has query params, appends with '&'.
 * If URL has no query params, appends with '?'.
 * Returns original URL if params object is empty.
 *
 * @param url - Base URL
 * @param params - Query parameters to append
 * @returns URL with query parameters appended
 * @example
 * appendQuery('/api/invoices', { status: 'pending' }) // '/api/invoices?status=pending'
 * appendQuery('/api?page=1', { status: 'active' }) // '/api?page=1&status=active'
 * appendQuery('/api', {}) // '/api'
 */
export function appendQuery(
  url: string,
  params: Record<string, string | number | boolean | undefined | null>
): string {
  const queryString = buildQuery(params);

  if (!queryString) {
    return url;
  }

  const hasQueryParams = url.includes('?');

  if (hasQueryParams) {
    // URL already has query params, append with '&'
    // Handle case where URL ends with '&'
    const endsWithAmpersand = url.endsWith('&');
    return endsWithAmpersand ? `${url}${queryString}` : `${url}&${queryString}`;
  }

  // No query params, prepend with '?'
  return `${url}?${queryString}`;
}