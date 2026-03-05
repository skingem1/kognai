/**
 * Type representing an event handler function.
 * @typeParam T - The data type passed to the handler
 */
export type EventHandler<T = unknown> = (data: T) => void;

/**
 * Typed event emitter for SDK internal pub/sub.
 * @typeParam Events - Record mapping event names to their payload types
 */
export class EventEmitter<Events extends Record<string, unknown> = Record<string, unknown>> {
  private listeners: Map<string, Set<EventHandler>>;

  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param event - The event name
   * @param handler - The handler function
   * @returns Unsubscribe function
   */
  on<K extends keyof Events & string>(event: K, handler: EventHandler<Events[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe from an event.
   * @param event - The event name
   * @param handler - The handler to remove
   */
  off<K extends keyof Events & string>(event: K, handler: EventHandler<Events[K]>): void {
    this.listeners.get(event)?.delete(handler);
  }

  /**
   * Emit an event to all handlers.
   * @param event - The event name
   * @param data - The data to pass to handlers
   */
  emit<K extends keyof Events & string>(event: K, data: Events[K]): void {
    this.listeners.get(event)?.forEach((handler) => handler(data));
  }

  /**
   * Subscribe to an event once, then auto-unsubscribe.
   * @param event - The event name
   * @param handler - The handler function
   * @returns Unsubscribe function
   */
  once<K extends keyof Events & string>(event: K, handler: EventHandler<Events[K]>): () => void {
    const wrapped: EventHandler<Events[K]> = (data) => {
      handler(data);
      this.off(event, wrapped);
    };
    return this.on(event, wrapped);
  }

  /** Clear listeners for an event or all events. */
  removeAllListeners(event?: string): void {
    event ? this.listeners.delete(event) : this.listeners.clear();
  }

  /** Get the number of listeners for an event. */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}