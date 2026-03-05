/**
 * Calculate sum of all numbers in an array.
 * @param numbers - Array of numbers to sum
 * @returns Sum of all numbers, or 0 if empty
 */
export function sum(numbers: number[]): number {
  return numbers.reduce((acc, n) => acc + n, 0);
}

/**
 * Calculate arithmetic mean of numbers in an array.
 * @param numbers - Array of numbers
 * @returns Arithmetic mean, or 0 if empty
 */
export function average(numbers: number[]): number {
  return numbers.length ? sum(numbers) / numbers.length : 0;
}

/**
 * Calculate median value of numbers in an array.
 * @param numbers - Array of numbers
 * @returns Median value, or 0 if empty
 */
export function median(numbers: number[]): number {
  if (!numbers.length) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Round a number to specified decimal places.
 * @param value - Number to round
 * @param decimals - Number of decimal places
 * @returns Rounded number
 */
export function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

/**
 * Linear interpolation between two values.
 * @param start - Start value
 * @param end - End value
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Calculate percentage of value relative to total.
 * @param value - The value to calculate percentage for
 * @param total - The total value
 * @returns Percentage (0-100), or 0 if total is 0
 */
export function percentage(value: number, total: number): number {
  return total ? (value / total) * 100 : 0;
}