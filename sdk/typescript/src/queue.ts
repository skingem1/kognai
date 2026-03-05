export class AsyncQueue {
  private concurrency: number;
  private running = 0;
  private queue: Array<() => Promise<void>> = [];

  constructor(concurrency: number = 1) {
    this.concurrency = concurrency;
  }

  /**
   * Add a task to the queue
   * @param task - Async function to execute
   * @returns Promise that resolves when the task completes
   */
  add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await task());
        } catch (e) {
          reject(e);
        }
      });
      this.flush();
    });
  }

  /** Process queued tasks up to concurrency limit (private) */
  private flush(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running++;
      task().finally(() => {
        this.running--;
        this.flush();
      });
    }
  }

  /** Get the number of pending tasks @returns Number of tasks in queue */
  get pending(): number {
    return this.queue.length;
  }

  /** Get the number of currently running tasks @returns Number of running tasks */
  get active(): number {
    return this.running;
  }
}