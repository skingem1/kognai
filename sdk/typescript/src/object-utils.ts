/**
 * Object manipulation utilities for TypeScript.
 * Pure TypeScript implementation with no external dependencies.
 */

/**
 * Picks specified keys from an object, returning a new object with only those keys.
 * @param obj - The source object
 * @param keys - Array of keys to pick
 * @returns New object with only the specified keys that exist on the source
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omits specified keys from an object, returning a new object without them.
 * @param obj - The source object
 * @param keys - Array of keys to omit
 * @returns New object without the specified keys
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj } as Record<string, unknown>;
  for (const key of keys) {
    delete result[key as string];
  }
  return result as Omit<T, K>;
}

/**
 * Maps over an object's values, transforming them while preserving keys.
 * @param obj - The source object
 * @param fn - Transformation function receiving value and key
 * @returns New object with transformed values
 */
export function mapValues<T extends Record<string, unknown>, R>(
  obj: T,
  fn: (value: T[keyof T], key: string) => R
): Record<string, R> {
  const result: Record<string, R> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = fn(value as T[keyof T], key);
  }
  return result;
}

/**
 * Filters object entries based on a predicate function.
 * @param obj - The source object
 * @param predicate - Function testing each key-value pair
 * @returns New object containing only matching entries
 */
export function filterEntries<T extends Record<string, unknown>>(
  obj: T,
  predicate: (key: string, value: unknown) => boolean
): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (predicate(key, value)) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/**
 * Checks if a value is empty according to type-specific rules.
 * @param value - The value to check
 * @returns True if value is null, undefined, empty string/array/object
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Flattens nested objects using dot notation for keys.
 * @param obj - The object to flatten
 * @param prefix - Optional prefix for nested keys
 * @returns Flattened object with dot-notation keys
 */
export function flatten(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flatten(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}