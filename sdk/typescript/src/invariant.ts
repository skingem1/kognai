/**
 * Assert a condition is truthy, throw if not
 * @param condition - Condition to check
 * @param message - Error message if assertion fails
 * @returns {void}
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Assert a value is not null or undefined
 * @param value - Value to check
 * @param name - Name of the value for error message
 * @returns The value if non-null
 */
export function assertDefined<T>(value: T | null | undefined, name: string): T {
  if (value == null) throw new Error(name + ' must be defined');
  return value;
}

/**
 * Assert a value is a string
 * @param value - Value to check
 * @param name - Name of the value
 * @returns The value if string
 */
export function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(name + ' must be a string');
  return value;
}

/**
 * Assert a value is a number
 * @param value - Value to check
 * @param name - Name of the value
 * @returns The value if number
 */
export function assertNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) throw new Error(name + ' must be a number');
  return value;
}

/**
 * Throw an unreachable error (for exhaustive switch checks)
 * @param value - The value that should never occur
 * @returns {never}
 */
export function unreachable(value: never): never {
  throw new Error('Unreachable: ' + String(value));
}