/**
 * Throttles a function to execute at most once per interval.
 * Uses leading edge (calls immediately on first invocation).
 * @param fn - The function to throttle
 * @param intervalMs - The minimum interval between function calls in milliseconds
 * @returns A throttled function with a cancel method
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  intervalMs: number
): T & { cancel: () => void } {
  let lastCalled = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const throttled = function (
    this: unknown,
    ...args: Parameters<T>
  ): ReturnType<T> | undefined {
    const now = Date.now();
    const timeSinceLastCall = now - lastCalled;

    if (timeSinceLastCall >= intervalMs) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCalled = now;
      return fn.apply(this, args);
    }

    if (!timeoutId) {
      const remaining = intervalMs - timeSinceLastCall;
      timeoutId = setTimeout(() => {
        lastCalled = Date.now();
        timeoutId = null;
      }, remaining);
    }

    return undefined;
  } as T & { cancel: () => void };

  throttled.cancel = (): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return throttled;
}

/**
 * Delays function execution until delayMs has elapsed since the last call.
 * @param fn - The function to debounce
 * @param delayMs - The delay in milliseconds
 * @returns A debounced function with cancel and flush methods
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): T & { cancel: () => void; flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastContext: unknown = null;

  const debounced = function (
    this: unknown,
    ...args: Parameters<T>
  ): ReturnType<T> | undefined {
    lastContext = this;
    lastArgs = args;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (lastArgs) {
        fn.apply(lastContext, lastArgs);
      }
    }, delayMs);

    return undefined;
  } as T & { cancel: () => void; flush: () => void };

  debounced.cancel = (): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  debounced.flush = (): void => {
    if (timeoutId && lastArgs) {
      clearTimeout(timeoutId);
      const args = lastArgs;
      const context = lastContext;
      timeoutId = null;
      fn.apply(context, args);
    }
  };

  return debounced;
}

/**
 * Rate limits a function to allow at most maxCalls within windowMs.
 * @param fn - The async function to rate limit
 * @param maxCalls - Maximum calls allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns A rate-limited async function
 */
export function rateLimit<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  maxCalls: number,
  windowMs: number
): T {
  const timestamps: number[] = [];

  return async function (
    this: unknown,
    ...args: Parameters<T>
  ): Promise<ReturnType<T>> {
    const now = Date.now();

    while (timestamps.length > 0 && now - timestamps[0] >= windowMs) {
      timestamps.shift();
    }

    if (timestamps.length >= maxCalls) {
      throw new Error('Rate limit exceeded');
    }

    timestamps.push(now);
    return fn.apply(this, args) as ReturnType<T>;
  } as T;
}