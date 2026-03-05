/**
 * Options for batch processing operations
 */
export interface BatchOptions<T> {
  batchSize: number;
  onBatch?: (batch: T[], index: number) => void;
  onComplete?: (total: number) => void;
}

/**
 * Splits an array into chunks of specified size
 * @throws Error if batchSize is less than 1
 */
export function createBatches<T>(items: T[], batchSize: number): T[][] {
  if (batchSize < 1) throw new Error('batchSize must be >= 1');
  if (!items.length) return [];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Processes items in batches sequentially
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const batches = createBatches(items, batchSize);
  const results: R[] = [];
  for (let i = 0; i < batches.length; i++) {
    const batchResults = await processor(batches[i]);
    results.push(...batchResults);
  }
  return results;
}

/**
 * Processes items with a concurrency limit using index-based semaphore
 */
export async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  let running = 0;

  return new Promise((resolve) => {
    function next(): void {
      while (running < concurrency && currentIndex < items.length) {
        const idx = currentIndex++;
        running++;
        fn(items[idx]).then((result) => {
          results[idx] = result;
          running--;
          next();
        });
      }
      if (currentIndex >= items.length && running === 0) resolve(results);
    }
    next();
  });
}

/**
 * Groups items by a key function result
 */
export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] ??= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

/** Alias for createBatches */
export const chunk = createBatches;