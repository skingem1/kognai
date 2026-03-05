/**
 * A listener function type that receives event data
 * @template T - The type of event data
 */
export type Listener<T> = (data: T) => void;

/**
 * A lightweight typed event emitter
 * @template Events - Record mapping event names to their data types
 */
export class TypedEmitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Listener<any>>>();

  /** Register an event listener @param event - Event name @param fn - Listener function @returns Unsubscribe function */
  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => { this.listeners.get(event)?.delete(fn); };
  }

  /** Emit an event to all listeners @param event - Event name @param data - Event data */
  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    this.listeners.get(event)?.forEach(fn => fn(data));
  }

  /** Remove all listeners for an event or all events @param event - Optional event name */
  off(event?: keyof Events): void {
    event ? this.listeners.delete(event) : this.listeners.clear();
  }

  /** Get listener count for an event @param event - Event name @returns Number of listeners */
  listenerCount(event: keyof Events): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}