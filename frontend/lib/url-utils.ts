/**
 * URL manipulation utilities for the frontend.
 * Pure functions using native URL/URLSearchParams.
 */

/**
 * Build URL with query parameters
 * @param base - Base URL
 * @param params - Query parameters (undefined/null values are skipped)
 * @returns URL with sorted query params for cache consistency
 */
export function buildUrl(
  base: string,
  params?: Record<string, string | number | boolean | undefined | null>
): string {
  if (!params) return base;

  const validParams = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null
  );

  if (validParams.length === 0) return base;

  const sorted = validParams.sort(([a], [b]) => a.localeCompare(b));
  const searchParams = new URLSearchParams();
  sorted.forEach(([key, value]) => searchParams.append(key, String(value)));

  return `${base}?${searchParams.toString()}`;
}

/**
 * Parse URL search string into key-value object
 * @param search - Search string (with or without leading '?')
 * @returns Record of query parameters
 */
export function parseQueryParams(search: string): Record<string, string> {
  const params: Record<string, string> = {};
  const searchParams = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/**
 * Join path segments with '/', removing duplicates and trailing slash
 * @param segments - Path segments to join
 * @returns Joined path string
 */
export function joinPaths(...segments: string[]): string {
  const filtered = segments.filter(Boolean);
  let path = filtered.join('/');
  path = path.replace(/(^|[^:])(\/\/)/g, '$1/');
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
}

/**
 * Check if URL is absolute (starts with http://, https://, or //)
 * @param url - URL to check
 * @returns True if URL is absolute
 */
export function isAbsoluteUrl(url: string): boolean {
  return /^(https?:\/\/|\/\/)/i.test(url);
}

/**
 * Split path into segments, filtering out empty strings
 * @param path - Path string
 * @returns Array of path segments
 */
export function getPathSegments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/**
 * Add trailing slash to path if not present
 * @param path - Path string
 * @returns Path with trailing slash
 */
export function addTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

/**
 * Remove trailing slash from path (except for root '/')
 * @param path - Path string
 * @returns Path without trailing slash
 */
export function removeTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}