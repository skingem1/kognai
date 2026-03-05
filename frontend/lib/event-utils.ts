/**
 * Event handling utilities for UI interactions.
 * Pure functions with no external dependencies.
 */

/**
 * Creates a debounced version of the provided function.
 * Delays execution until delayMs milliseconds have elapsed since the last call.
 * @template T - Function type
 * @param fn - Function to debounce
 * @param delayMs - Delay in milliseconds
 * @returns Debounced function with cancel method
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}

/**
 * Creates a throttled version of the provided function.
 * Ensures fn is called at most once per limitMs period.
 * First call executes immediately.
 * @template T - Function type
 * @param fn - Function to throttle
 * @param limitMs - Time limit in milliseconds
 * @returns Throttled function with cancel method
 */
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  limitMs: number
): T & { cancel: () => void } {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const throttled = ((...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= limitMs) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, limitMs - timeSinceLastCall);
    }
  }) as T & { cancel: () => void };

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return throttled;
}

/**
 * Returns a function that calls fn only on the first invocation.
 * Subsequent calls return the first result.
 * @template T - Function type
 * @param fn - Function to execute only once
 * @returns Wrapped function that executes once
 */
export function once<T extends (...args: any[]) => any>(fn: T): T {
  let called = false;
  let result: ReturnType<T>;

  return ((...args: Parameters<T>) => {
    if (!called) {
      result = fn(...args);
      called = true;
    }
    return result;
  }) as T;
}

/**
 * Calls both preventDefault and stopPropagation on the event.
 * Utility for drag-and-drop handlers.
 * @param event - Event with preventDefault and stopPropagation methods
 */
export function preventDefaults(
  event: { preventDefault: () => void; stopPropagation: () => void }
): void {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Returns a function that checks if event.key matches the given key.
 * Case-sensitive comparison.
 * @param key - Key to match against event.key
 * @returns Function that checks if event.key equals the provided key
 */
export function isKeyboardEvent(
  key: string
): (event: { key: string }) => boolean {
  return (event: { key: string }) => event.key === key;
}