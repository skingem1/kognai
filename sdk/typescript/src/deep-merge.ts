/**
 * Deep merge utility for configuration objects.
 * Pure TypeScript, no external dependencies.
 */

/**
 * Checks if a value is a plain object (not array, Date, RegExp, Map, Set, etc.)
 * @param value - The value to check
 * @returns True if value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Deep clones a value using structuredClone if available, else JSON parse/stringify
 * @param value - The value to clone
 * @returns Deep cloned value
 */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

/**
 * Deep equality check. NaN equals NaN. Arrays and plain objects are compared deeply.
 * @param a - First value
 * @param b - Second value
 * @returns True if values are deeply equal
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (Number.isNaN(a) && Number.isNaN(b)) return true;

  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Merges multiple objects deeply. Later sources override earlier ones.
 * Arrays are replaced (not merged). Undefined values do NOT override target.
 * null values DO override target. Does not mutate inputs.
 * @param sources - Objects to merge
 * @returns Merged object
 */
export function deepMerge<T extends Record<string, unknown>>(...sources: Partial<T>[]): T {
  const result: Record<string, unknown> = {};

  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(source) as (keyof T)[]) {
      const sVal = source[key];
      const rVal = result[key];

      if (sVal === undefined) continue;

      if (isPlainObject(sVal) && isPlainObject(rVal)) {
        result[key] = deepMerge(rVal as Record<string, unknown>, sVal as Record<string, unknown>);
      } else {
        result[key] = sVal;
      }
    }
  }

  return result as T;
}

/**
 * Returns new object with only the specified keys. Includes keys with undefined values.
 * @param obj - Source object
 * @param keys - Keys to pick
 * @returns New object with only the specified keys
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const acc: Partial<Pick<T, K>> = {};
  for (const k of keys) {
    acc[k] = obj[k];
  }
  return acc as Pick<T, K>;
}

/**
 * Returns new object without the specified keys.
 * @param obj - Source object
 * @param keys - Keys to omit
 * @returns New object without the specified keys
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const k of keys) {
    delete result[k];
  }
  return result as Omit<T, K>;
}