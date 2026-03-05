/**
 * Parses a cookie header string into key-value pairs.
 * @param cookieStr - The cookie header string to parse.
 * @returns A record mapping cookie names to decoded values.
 */
export function parseCookies(cookieStr: string): Record<string, string> {
  return cookieStr.split('; ').reduce((cookies, pair) => {
    const [key, ...valueParts] = pair.split('=');
    cookies[key.trim()] = decodeURIComponent(valueParts.join('='));
    return cookies;
  }, {} as Record<string, string>);
}

/**
 * Builds a Set-Cookie header string with optional attributes.
 * @param name - The cookie name.
 * @param value - The cookie value.
 * @param options - Optional cookie attributes (maxAge, path, secure, httpOnly, sameSite).
 * @returns The serialized cookie string for the Set-Cookie header.
 */
export function serializeCookie(
  name: string,
  value: string,
  options?: { maxAge?: number; path?: string; secure?: boolean; httpOnly?: boolean; sameSite?: 'Strict' | 'Lax' | 'None' }
): string {
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (options?.maxAge !== undefined) cookie += `; Max-Age=${options.maxAge}`;
  if (options?.path) cookie += `; Path=${options.path}`;
  if (options?.secure) cookie += '; Secure';
  if (options?.httpOnly) cookie += '; HttpOnly';
  if (options?.sameSite) cookie += `; SameSite=${options.sameSite}`;
  return cookie;
}

/**
 * Retrieves a specific cookie value by name from a cookie header string.
 * @param cookieStr - The cookie header string to search.
 * @param name - The name of the cookie to retrieve.
 * @returns The decoded cookie value, or undefined if not found.
 */
export function getCookie(cookieStr: string, name: string): string | undefined {
  return parseCookies(cookieStr)[name];
}

/**
 * Creates a cookie string that deletes a cookie by setting Max-Age to 0.
 * @param name - The name of the cookie to delete.
 * @param path - Optional path for the cookie (defaults to '/').
 * @returns The serialized cookie string for deleting the cookie.
 */
export function deleteCookie(name: string, path?: string): string {
  return serializeCookie(name, '', { maxAge: 0, path: path || '/' });
}