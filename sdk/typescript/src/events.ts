export type SdkEventMap = {
  'request:start': { method: string; url: string };
  'request:end': { method: string; url: string; status: number; durationMs: number };
  'request:error': { method: string; url: string; error: Error };
  'rate-limit:hit': { retryAfter: number };
};

type SdkListener<T> = (data: T) => void;

export class SdkEventEmitter {
  private listeners: Map<keyof SdkEventMap, Set<Function>> = new Map();

  on<K extends keyof SdkEventMap>(event: K, listener: SdkListener<SdkEventMap[K]>): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }

  off<K extends keyof SdkEventMap>(event: K, listener: SdkListener<SdkEventMap[K]>): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof SdkEventMap>(event: K, data: SdkEventMap[K]): void {
    this.listeners.get(event)?.forEach((listener) => listener(data));
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}