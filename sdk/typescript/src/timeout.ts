/**
 * Timeout controller utility for wrapping HTTP/fetch calls with configurable timeouts.
 * @package @countable/sdk
 */

export class TimeoutError extends Error {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;

    // Maintains proper stack trace in V8 environments (Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimeoutError);
    }
  }
}

/**
 * Wraps a promise with a timeout.
 * @template T - The resolved value type of the promise
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @returns A promise that resolves with the original value or rejects with TimeoutError
 * @throws {TimeoutError} When the timeout is reached before the promise resolves
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(timeoutMs));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Creates an AbortSignal that will abort after the specified timeout.
 * Uses the native AbortSignal.timeout() API available in Node.js 17+ and modern browsers.
 * @param timeoutMs - Timeout in milliseconds
 * @returns An AbortSignal that automatically aborts after the timeout
 */
export function createAbortSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}