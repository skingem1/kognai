/**
 * Resolves after the specified delay.
 * @param ms - Delay in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Race a promise against a timeout, rejecting if timeout wins.
 * @param promise - The promise to race
 * @param ms - Timeout in milliseconds
 * @param message - Optional error message
 */
export async function timeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  let timer: number;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || 'Operation timed out')), ms);
  });
  try { return await Promise.race([promise, timeoutPromise]); }
  finally { clearTimeout(timer); }
}

/**
 * Retry a function with configurable attempts and delay.
 * @param fn - Function to retry
 * @param options - maxAttempts (default 3), delayMs (default 1000), onError callback
 */
export async function retry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 3, delayMs = 1000, onError }: { maxAttempts?: number; delayMs?: number; onError?: (e: Error, a: number) => void } = {}
): Promise<T> {
  let lastError: Error;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (e) { lastError = e as Error; if (onError) onError(lastError, attempt); if (attempt < maxAttempts) await sleep(delayMs); }
  }
  throw lastError!;
}

/**
 * Wait for all promises and separate results into fulfilled values and rejected errors.
 * @param promises - Array of promises to settle
 */
export async function allSettledWithErrors<T>(promises: Promise<T>[]): Promise<{ fulfilled: T[]; rejected: Error[] }> {
  const results = await Promise.allSettled(promises);
  const fulfilled: T[] = [], rejected: Error[] = [];
  results.forEach((r, i) => r.status === 'fulfilled' ? fulfilled.push(r.value) : rejected.push(r.reason as Error));
  return { fulfilled, rejected };
}

/**
 * Execute tasks with a concurrency limit, returning results in original order.
 * @param tasks - Array of task functions returning promises
 * @param concurrency - Maximum concurrent executions
 */
export async function promisePool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}