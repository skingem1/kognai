/**
 * Array utility functions for common array operations used in data display.
 * Pure functions with no external dependencies.
 */

/**
 * Group an array of objects by a key.
 * @example
 * groupBy([{status:'pending',id:1},{status:'paid',id:2},{status:'pending',id:3}], 'status')
 * => { pending: [{status:'pending',id:1},{status:'pending',id:3}], paid: [{status:'paid',id:2}] }
 */
export function groupBy<T extends Record<string, unknown>>(items: T[], key: keyof T): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((result, item) => {
    const groupKey = String(item[key]);
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {});
}

/**
 * Remove duplicate items from array based on a key.
 * @example
 * uniqueBy([{id:1,name:'a'},{id:2,name:'b'},{id:1,name:'c'}], 'id')
 * => [{id:1,name:'a'},{id:2,name:'b'}]
 */
export function uniqueBy<T extends Record<string, unknown>>(items: T[], key: keyof T): T[] {
  const seen = new Set<unknown>();
  return items.filter((item) => {
    const value = item[key];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

/**
 * Sort an array of objects by a key.
 * @example
 * sortBy([{name:'Charlie'},{name:'Alice'},{name:'Bob'}], 'name')
 * => [{name:'Alice'},{name:'Bob'},{name:'Charlie'}]
 * sortBy([{age:30},{age:20}], 'age', 'desc') => [{age:30},{age:20}]
 */
export function sortBy<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T,
  direction: 'asc' | 'desc' = 'asc'
): T[] {
  const sortedItems = items.slice();

  sortedItems.sort((a, b) => {
    const aValue = a[key];
    const bValue = b[key];

    // Handle string comparison with localeCompare for proper internationalization
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      const comparison = aValue.localeCompare(bValue);
      return direction === 'desc' ? -comparison : comparison;
    }

    // Handle numeric comparison
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return direction === 'desc' ? bValue - aValue : aValue - bValue;
    }

    // Fallback: convert to strings for comparison
    const aStr = String(aValue);
    const bStr = String(bValue);
    const comparison = aStr.localeCompare(bStr);
    return direction === 'desc' ? -comparison : comparison;
  });

  return sortedItems;
}

/**
 * Chunk an array into groups of a specified size.
 * @example
 * chunk([1,2,3,4,5], 2) => [[1,2],[3,4],[5]]
 * chunk([], 3) => []
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

/**
 * Get the sum of a numeric property in an array of objects.
 * @example
 * sumBy([{amount:10},{amount:20},{amount:30}], 'amount') => 60
 * sumBy([], 'amount') => 0
 */
export function sumBy<T extends Record<string, unknown>>(items: T[], key: keyof T): number {
  return items.reduce<number>((sum, item) => {
    const value = item[key];
    const numericValue = typeof value === 'number' ? value : Number(value);
    return sum + (isNaN(numericValue) ? 0 : numericValue);
  }, 0);
}