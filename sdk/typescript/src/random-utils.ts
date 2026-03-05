/**
 * Returns a random integer between min and max (inclusive).
 * @param min - The minimum value (inclusive)
 * @param max - The maximum value (inclusive)
 * @returns A random integer between min and max
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a random float between min and max.
 * @param min - The minimum value (inclusive)
 * @param max - The maximum value (inclusive)
 * @param decimals - Optional number of decimal places to round to
 * @returns A random float between min and max
 */
export function randomFloat(min: number, max: number, decimals?: number): number {
  const result = Math.random() * (max - min) + min;
  return decimals !== undefined ? parseFloat(result.toFixed(decimals)) : result;
}

/**
 * Returns a random element from an array.
 * @param array - The array to choose from
 * @returns A random element from the array, or undefined if empty
 */
export function randomChoice<T>(array: T[]): T | undefined {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Returns a new shuffled array using Fisher-Yates algorithm.
 * @param array - The array to shuffle
 * @returns A new shuffled array (original array is not mutated)
 */
export function randomShuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generates a random hex string.
 * @param length - Optional length of the hex string (default: 8)
 * @returns A random hex string
 */
export function randomHex(length?: number): string {
  const chars = '0123456789abcdef';
  const len = length ?? 8;
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}