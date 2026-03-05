/**
 * Runtime type guard functions for SDK data validation.
 * @packageDocumentation
 */

/**
 * Checks if a value is a string.
 * @param value - The value to check
 * @returns True if the value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Checks if a value is a number (excluding NaN).
 * @param value - The value to check
 * @returns True if the value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Checks if a value is a boolean.
 * @param value - The value to check
 * @returns True if the value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Checks if a value is a plain object (not null, not array).
 * @param value - The value to check
 * @returns True if the value is a plain object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks if a value is an array.
 * @param value - The value to check
 * @returns True if the value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Checks if a value is non-empty.
 * @param value - The value to check
 * @returns True if string/array/object is non-empty
 */
export function isNonEmpty(value: unknown): boolean {
  if (isString(value)) return value.trim().length > 0;
  if (isArray(value)) return value.length > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  return false;
}

/**
 * Checks if a value is null or undefined.
 * @param value - The value to check
 * @returns True if the value is null or undefined
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Checks if an object has a specific own property.
 * @param obj - The object to check
 * @param key - The property key to look for
 * @returns True if the object has the property
 */
export function hasProperty<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return isObject(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Asserts that a value is defined (not null or undefined).
 * @param value - The value to assert
 * @param name - Optional name for error message
 * @throws Error if value is null or undefined
 */
export function assertDefined<T>(value: T | null | undefined, name?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${name || 'value'} to be defined`);
  }
}

/**
 * Checks if a value is an instance of a constructor.
 * @param value - The value to check
 * @param constructor - The constructor function
 * @returns True if the value is an instance of the constructor
 */
export function isInstanceOf<T>(value: unknown, constructor: new (...args: unknown[]) => T): value is T {
  return value instanceof constructor;
}