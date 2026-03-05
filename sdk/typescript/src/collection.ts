/**
 * Group array items by a key function
 * @param items - Array to group
 * @param keyFn - Function to extract grouping key
 * @returns Record of grouped items
 */
export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => { const key = keyFn(item); (acc[key] = acc[key] || []).push(item); return acc }, {} as Record<string, T[]>);
}

/**
 * Create a lookup map from an array
 * @param items - Array to index
 * @param keyFn - Function to extract key
 * @returns Map from key to item
 */
export function keyBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T> {
  return items.reduce((acc, item) => { acc[keyFn(item)] = item; return acc }, {} as Record<string, T>);
}

/**
 * Get unique items from array
 * @param items - Array to deduplicate
 * @param keyFn - Optional key function for uniqueness
 * @returns Array of unique items
 */
export function unique<T>(items: T[], keyFn?: (item: T) => unknown): T[] {
  if (!keyFn) return [...new Set(items)];
  const seen = new Set(); return items.filter(item => { const key = keyFn(item); if (seen.has(key)) return false; seen.add(key); return true });
}

/**
 * Chunk an array into smaller arrays
 * @param items - Array to chunk
 * @param size - Chunk size
 * @returns Array of chunks
 */
export function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
}

/**
 * Flatten a nested array one level deep
 * @param items - Nested array
 * @returns Flattened array
 */
export function flatten<T>(items: (T | T[])[]): T[] {
  return items.flat() as T[];
}