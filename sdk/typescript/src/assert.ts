/**
 * Assertion utilities for runtime validation with descriptive errors.
 * Pure TypeScript, no external dependencies.
 */

/**
 * Throws an error if the condition is falsy.
 */
export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message || 'Assertion failed');
}

/**
 * Throws an error if the value is not a string.
 */
export function assertString(value: unknown, name?: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`Expected ${name || 'value'} to be a string, got ${typeof value}`);
}

/**
 * Throws an error if the value is not a number (or is NaN).
 */
export function assertNumber(value: unknown, name?: string): asserts value is number {
  if (typeof value !== 'number' || Number.isNaN(value)) throw new Error(`Expected ${name || 'value'} to be a number`);
}

/**
 * Throws an error if the value is not a plain object.
 */
export function assertObject(value: unknown, name?: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Expected ${name || 'value'} to be an object`);
}

/**
 * Throws an error if the value is not an array.
 */
export function assertArray(value: unknown, name?: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${name || 'value'} to be an array`);
}

/**
 * Throws an error if the value is empty (string, array, or object).
 */
export function assertNonEmpty(value: unknown, name?: string): void {
  if (typeof value === 'string') {
    if (value.trim().length === 0) throw new Error(`Expected ${name || 'value'} to be a non-empty string`);
  } else if (Array.isArray(value)) {
    if (value.length === 0) throw new Error(`Expected ${name || 'value'} to be a non-empty array`);
  } else if (typeof value === 'object' && value !== null) {
    if (Object.keys(value).length === 0) throw new Error(`Expected ${name || 'value'} to be a non-empty object`);
  } else {
    throw new Error(`Expected ${name || 'value'} to be non-empty`);
  }
}

/**
 * Throws an error if the value is not in the specified range (inclusive).
 */
export function assertInRange(value: number, min: number, max: number, name?: string): void {
  assertNumber(value, name);
  if (value < min || value > max) throw new Error(`Expected ${name || 'value'} to be between ${min} and ${max}`);
}

/**
 * Throws an error if the value is not one of the allowed values.
 */
export function assertOneOf<T>(value: T, allowed: T[], name?: string): void {
  if (!allowed.includes(value)) throw new Error(`Expected ${name || 'value'} to be one of: ${allowed.join(', ')}`);
}