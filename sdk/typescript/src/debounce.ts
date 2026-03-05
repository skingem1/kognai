/**
 * Creates a debounced version of a function that delays invocation until delay ms after last call.
 * @param fn - The function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function with cancel method
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const debounced = ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as unknown as T & { cancel: () => void };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

/**
 * Creates a throttled version of a function that executes at most once per limit ms.
 * @param fn - The function to throttle
 * @param limit - Time limit in milliseconds
 * @returns Throttled function with cancel method
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): T & { cancel: () => void } {
  let lastCall = 0;
  const throttled = ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      fn(...args);
    }
  }) as unknown as T & { cancel: () => void };
  throttled.cancel = () => { lastCall = 0; };
  return throttled;
}
