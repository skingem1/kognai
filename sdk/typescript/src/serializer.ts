/**
 * Serialization utilities for safely handling data in API requests/responses.
 * @packageDocumentation
 */

/**
 * Safely parse a JSON string, returning a default value on failure.
 * @param json - The JSON string to parse
 * @param fallback - Optional fallback value if parsing fails
 * @returns The parsed object, fallback, or null
 * @example
 * ```typescript
 * safeJsonParse('{"a":1}') // => { a: 1 }
 * safeJsonParse('invalid') // => null
 * safeJsonParse('invalid', {}) // => {}
 * ```
 */
export function safeJsonParse<T>(json: string, fallback?: T): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return (fallback !== undefined ? fallback : null) as T | null;
  }
}

/**
 * Convert an object to a sorted-key JSON string (deterministic).
 * @param value - The value to stringify
 * @returns A JSON string with keys sorted alphabetically
 * @example
 * ```typescript
 * stableStringify({ b: 2, a: 1 }) // => '{"a":1,"b":2}'
 * stableStringify(null) // => 'null'
 * ```
 */
export function stableStringify(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }

  const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
  const sortedObj: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    sortedObj[key] = (value as Record<string, unknown>)[key];
  }

  return JSON.stringify(sortedObj);
}

/**
 * Deep clone an object using JSON serialization.
 * @param value - The value to clone
 * @returns A deep copy of the value
 * @example
 * ```typescript
 * const original = { a: { b: 1 } };
 * const cloned = deepClone(original);
 * cloned.a.b = 2;
 * original.a.b // => 1
 * ```
 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Convert a flat object to URL-encoded form data string.
 * @param params - The parameters to encode
 * @returns URL-encoded string
 * @example
 * ```typescript
 * toFormData({ name: 'test', count: '5' }) // => 'name=test&count=5'
 * toFormData({}) // => ''
 * ```
 */
export function toFormData(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
}

/**
 * Mask sensitive fields in an object for logging.
 * @param obj - The object to mask
 * @param sensitiveKeys - Array of keys to mask
 * @returns A new object with sensitive fields replaced
 * @example
 * ```typescript
 * maskSensitiveFields({ apiKey: 'sk-secret', name: 'test' }, ['apiKey'])
 * // => { apiKey: '***REDACTED***', name: 'test' }
 * ```
 */
export function maskSensitiveFields<T extends Record<string, unknown>>(
  obj: T,
  sensitiveKeys: string[]
): T {
  const masked = { ...obj };

  for (const key of sensitiveKeys) {
    if (key in masked) {
      masked[key] = '***REDACTED***' as T[Extract<keyof T, string>];
    }
  }

  return masked;
}