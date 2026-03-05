/**
 * Comparison utilities for the Countable SDK
 * @packageDocumentation
 */

/**
 * Clamp a number between min and max bounds.
 *
 * @param value - The number to clamp
 * @param min - The minimum bound (inclusive)
 * @param max - The maximum bound (inclusive)
 * @returns The clamped value between min and max
 * @throws Error if min is greater than max
 *
 * @example
 * clamp(5, 0, 10)   // => 5
 * clamp(-5, 0, 10)  // => 0
 * clamp(15, 0, 10)  // => 10
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new Error(`Invalid clamp bounds: min (${min}) cannot be greater than max (${max})`);
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

/**
 * Check if two floating point numbers are approximately equal.
 *
 * @param a - First number to compare
 * @param b - Second number to compare
 * @param tolerance - Maximum difference to be considered equal (default: 0.0001)
 * @returns True if the absolute difference between a and b is within tolerance
 *
 * @example
 * isApproxEqual(0.1 + 0.2, 0.3)        // => true
 * isApproxEqual(1.0, 1.0001, 0.001)    // => true
 * isApproxEqual(1.0, 1.01, 0.001)      // => false
 * isApproxEqual(100, 100.00001)        // => true (default tolerance)
 */
export function isApproxEqual(a: number, b: number, tolerance: number = 0.0001): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return false;
  }

  if (tolerance < 0) {
    throw new Error(`Tolerance must be non-negative, got: ${tolerance}`);
  }

  return Math.abs(b - a) <= tolerance;
}