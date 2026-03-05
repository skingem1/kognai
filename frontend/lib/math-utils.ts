/**
 * Math utility functions for financial dashboards.
 * Pure functions with no external dependencies.
 */

/**
 * Clamps a value to a given range.
 * @param value - The value to clamp
 * @param min - Minimum bound
 * @param max - Maximum bound
 * @returns The clamped value within [min, max]
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) [min, max] = [max, min];
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values.
 * @param start - Starting value
 * @param end - Ending value
 * @param t - Interpolation factor (0-1 typically, but not clamped)
 * @returns Interpolated value
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Rounds a number to specified decimal places.
 * @param value - The value to round
 * @param decimals - Number of decimal places (default: 2)
 * @returns Rounded value
 */
export function roundTo(value: number, decimals: number = 2): number {
  const d = Math.max(0, Math.floor(decimals));
  const factor = Math.pow(10, d);
  return Math.round(value * factor) / factor;
}

/**
 * Calculates percentage of value relative to total.
 * @param value - The portion value
 * @param total - The total value
 * @returns Percentage (value/total * 100), or 0 if total is 0
 */
export function percentage(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

/**
 * Calculates the arithmetic mean of an array of numbers.
 * @param values - Array of numbers
 * @returns Average value, or 0 if array is empty
 */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

/**
 * Calculates the median of an array of numbers.
 * @param values - Array of numbers
 * @returns Median value, or 0 if array is empty
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Sums all values in an array.
 * @param values - Array of numbers
 * @returns Sum of all values, or 0 if array is empty
 */
export function sum(values: number[]): number {
  return values.reduce((acc, val) => acc + val, 0);
}