/** Timer interface for measuring elapsed time. */
export interface Timer {
  /** Starts the timer. */
  start: () => void;
  /** Stops the timer and accumulates elapsed time. */
  stop: () => void;
  /** Resets the timer to zero. */
  reset: () => void;
  /** Returns elapsed time in milliseconds. */
  elapsed: () => number;
  /** Returns whether the timer is currently running. */
  isRunning: () => boolean;
}

/**
 * Creates a new Timer instance.
 * @returns A new Timer object.
 */
export function createTimer(): Timer {
  let startTime: number | null = null;
  let accumulated = 0;
  let running = false;
  return {
    start: () => { if (!running) { startTime = Date.now(); running = true; } },
    stop: () => { if (running) { accumulated += Date.now() - startTime!; running = false; } },
    reset: () => { accumulated = 0; startTime = null; running = false; },
    elapsed: () => accumulated + (running ? Date.now() - startTime! : 0),
    isRunning: () => running,
  };
}

/**
 * Pauses execution for the specified duration.
 * @param ms - Number of milliseconds to sleep.
 * @returns Promise that resolves after the specified time.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Measures the execution time of a synchronous function.
 * @param fn - Function to measure.
 * @returns Object containing the function result and duration in milliseconds.
 */
export function measure<T>(fn: () => T): { result: T; duration: number } {
  const start = Date.now();
  const result = fn();
  return { result, duration: Date.now() - start };
}