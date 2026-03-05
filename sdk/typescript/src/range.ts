/**
 * Generates an array of numbers from start (inclusive) to end (exclusive).
 * @param start - The starting number (inclusive)
 * @param end - The ending number (exclusive)
 * @param step - The increment/decrement value (default: 1 if start < end, -1 otherwise)
 * @returns Array of numbers from start to end
 * @throws Error if step is 0
 */
export function range(start: number, end: number, step?: number): number[] {
  const s = step ?? (start < end ? 1 : -1);
  if (s === 0) throw new Error('Step cannot be zero');
  const result: number[] = [];
  for (let i = start; start < end ? i < end : i > end; i += s) {
    result.push(i);
  }
  return result;
}

/**
 * Checks if a value is within [min, max] (inclusive on both ends).
 * @param value - The value to check
 * @param min - The minimum bound (inclusive)
 * @param max - The maximum bound (inclusive)
 * @returns True if value is within [min, max]
 */
export function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Clamps a value to [min, max] range.
 * @param value - The value to clamp
 * @param min - The minimum bound
 * @param max - The maximum bound
 * @returns The clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}