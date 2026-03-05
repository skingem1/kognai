/**
 * Measure execution time of a synchronous function.
 * @param fn - Function to measure
 * @returns Object with result and duration in milliseconds
 */
export function measureSync<T>(fn: () => T): { result: T; duration: number } {
  const start = performance.now();
  const result = fn();
  return { result, duration: performance.now() - start };
}

/**
 * Measure execution time of an async function.
 * @param fn - Async function to measure
 * @returns Promise of object with result and duration in milliseconds
 */
export async function measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, duration: performance.now() - start };
}

/**
 * Create a simple timer.
 * @returns Object with stop method that returns elapsed milliseconds
 */
export function createTimer(): { stop: () => number } {
  const start = performance.now();
  return { stop: () => performance.now() - start };
}

/**
 * Format milliseconds to human readable string.
 * @param ms - Milliseconds
 * @returns Formatted string like '1.23s' or '456ms'
 */
export function formatDuration(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
  return Math.round(ms) + 'ms';
}