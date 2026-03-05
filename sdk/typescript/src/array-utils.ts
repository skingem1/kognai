/**
 * Removes duplicate values from an array while preserving order.
 * @param array - The array to remove duplicates from
 * @returns New array with duplicates removed
 */
export function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

/**
 * Splits an array into chunks of the specified size.
 * @param array - The array to chunk
 * @param size - The chunk size
 * @returns Array of chunks
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) return [];
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, (i + 1) * size)
  );
}

/**
 * Flattens an array one level deep.
 * @param array - The array to flatten
 * @returns Flattened array
 */
export function flatten<T>(array: (T | T[])[]): T[] {
  return array.flat() as T[];
}

/**
 * Groups array items by a key property or key function.
 * @param array - The array to group
 * @param key - Property name or key function
 * @returns Record of grouped arrays
 */
export function groupBy<T>(array: T[], key: keyof T | ((item: T) => string)): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const group = typeof key === 'function' ? key(item) : String(item[key]);
    (acc[group] ??= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

/**
 * Returns elements present in both arrays.
 * @param a - First array
 * @param b - Second array
 * @returns Array of common elements
 */
export function intersection<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}