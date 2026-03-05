/**
 * URL Builder utility module for the SDK.
 * Provides functions for constructing API endpoint URLs with query parameters.
 */

/**
 * Joins path segments, handling leading/trailing slashes correctly.
 * @example joinPath('/api', '/invoices', '/inv_1') => '/api/invoices/inv_1'
 * @example joinPath('api/', '/invoices/') => 'api/invoices'
 */
export function joinPath(...segments: string[]): string {
  // Filter out empty segments
  const nonEmptySegments = segments.filter((segment) => segment !== '');

  if (nonEmptySegments.length === 0) {
    return '';
  }

  // Check if first segment has leading slash (to preserve it)
  const hasLeadingSlash = nonEmptySegments[0].startsWith('/');

  // Strip leading/trailing slashes from all segments
  const cleanedSegments = nonEmptySegments.map((segment) => {
    let cleaned = segment;
    // Remove leading slash
    if (cleaned.startsWith('/')) {
      cleaned = cleaned.slice(1);
    }
    // Remove trailing slash
    if (cleaned.endsWith('/')) {
      cleaned = cleaned.slice(0, -1);
    }
    return cleaned;
  });

  // Join with '/'
  let result = cleanedSegments.join('/');

  // Add leading slash back if the first segment had one
  if (hasLeadingSlash) {
    result = '/' + result;
  }

  return result;
}

/**
 * Appends query parameters to a base URL.
 * Skips undefined/null values. Encodes values.
 * @example appendQueryParams('/invoices', { limit: '10', status: 'paid', offset: undefined }) => '/invoices?limit=10&status=paid'
 * @example appendQueryParams('/invoices', {}) => '/invoices'
 * @example appendQueryParams('/invoices') => '/invoices'
 */
export function appendQueryParams(
  baseUrl: string,
  params?: Record<string, string | number | boolean | undefined | null>
): string {
  // Return base URL unchanged if no params object provided or empty
  if (!params || Object.keys(params).length === 0) {
    return baseUrl;
  }

  // Filter valid params (exclude null/undefined) and build query string
  const validParamPairs: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    // Skip null and undefined values
    if (value === null || value === undefined) {
      continue;
    }

    // Convert number/boolean to string
    const stringValue = String(value);

    // Encode key and value using encodeURIComponent
    const encodedKey = encodeURIComponent(key);
    const encodedValue = encodeURIComponent(stringValue);

    validParamPairs.push(`${encodedKey}=${encodedValue}`);
  }

  // Return base URL unchanged if no valid params after filtering
  if (validParamPairs.length === 0) {
    return baseUrl;
  }

  return `${baseUrl}?${validParamPairs.join('&')}`;
}

/**
 * Builds a complete API URL from base, path segments, and optional query params.
 * @example buildUrl('https://api.invoica.com', ['invoices', 'inv_1'], { expand: 'true' }) => 'https://api.invoica.com/invoices/inv_1?expand=true'
 */
export function buildUrl(
  baseUrl: string,
  pathSegments: string[],
  params?: Record<string, string | number | boolean | undefined | null>
): string {
  const urlWithPath = joinPath(baseUrl, ...pathSegments);
  return appendQueryParams(urlWithPath, params);
}