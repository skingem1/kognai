/**
 * Object utility functions for common operations.
 */

/**
 * Pick specified keys from an object.
 * pick({ a: 1, b: 2, c: 3 }, ['a', 'c']) => { a: 1, c: 3 }
 * pick({ a: 1 }, ['b']) => {}
 */
export function pick<T extends Record<string, unknown>>(obj: T, keys: (keyof T)[]): Partial<T> {
  const result = {} as Partial<T>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specified keys from an object.
 * omit({ a: 1, b: 2, c: 3 }, ['b']) => { a: 1, c: 3 }
 * omit({}, ['a']) => {}
 */
export function omit<T extends Record<string, unknown>>(obj: T, keys: (keyof T)[]): Partial<T> {
  const result = {} as Partial<T>;
  const keysToOmit = new Set(keys);
  
  for (const [key, value] of Object.entries(obj)) {
    if (!keysToOmit.has(key as keyof T)) {
      result[key as keyof T] = value as T[keyof T];
    }
  }
  
  return result;
}

/**
 * Check if an object is empty (no own enumerable keys).
 * isEmpty({}) => true
 * isEmpty({ a: 1 }) => false
 */
export function isEmpty(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length === 0;
}

/**
 * Deep compare two values for equality.
 * isEqual({ a: 1 }, { a: 1 }) => true
 * isEqual({ a: 1 }, { a: 2 }) => false
 * isEqual([1, 2], [1, 2]) => true
 * isEqual('hello', 'hello') => true
 */
export function isEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Flatten a nested object with dot-notation keys.
 * flatten({ a: { b: 1, c: { d: 2 } } }) => { 'a.b': 1, 'a.c.d': 2 }
 * flatten({ a: 1 }) => { a: 1 }
 */
export function flatten(obj: Record<string, unknown>, prefix?: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      const nested = flatten(value as Record<string, unknown>, flatKey);
      Object.assign(result, nested);
    } else {
      result[flatKey] = value;
    }
  }
  
  return result;
}