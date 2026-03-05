/**
 * A type representing either a success value or an error.
 * @template T - The success value type
 * @template E - The error type, defaults to Error
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Creates a successful result.
 * @template T - The value type
 * @param value - The success value
 * @returns A result with ok: true
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Creates an error result.
 * @template E - The error type
 * @param error - The error value
 * @returns A result with ok: false
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Type guard to check if a result is successful.
 * @template T - The value type
 * @template E - The error type
 * @param result - The result to check
 * @returns True if the result is ok
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok === true;
}

/**
 * Type guard to check if a result is an error.
 * @template T - The value type
 * @template E - The error type
 * @param result - The result to check
 * @returns True if the result is an error
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false;
}

/**
 * Unwraps a result, returning the value or throwing the error.
 * @template T - The value type
 * @template E - The error type
 * @param result - The result to unwrap
 * @returns The value if ok
 * @throws The error if err
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwraps a result, returning the value or a default.
 * @template T - The value type
 * @template E - The error type
 * @param result - The result to unwrap
 * @param defaultValue - The default value to return if err
 * @returns The value if ok, otherwise the default
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/**
 * Maps a result's value to a new value.
 * @template T - The original value type
 * @template U - The new value type
 * @template E - The error type
 * @param result - The result to map
 * @param fn - The function to apply to the value
 * @returns A new result with the mapped value or the error
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Maps a result's error to a new error.
 * @template T - The value type
 * @template E - The original error type
 * @template F - The new error type
 * @param result - The result to map
 * @param fn - The function to apply to the error
 * @returns A new result with the mapped error or the value
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}