/**
 * In-memory cache with TTL support for SDK response caching.
 * @fileoverview Pure TypeScript implementation using Map for storage.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCache<T> {
  private store: Map<string, CacheEntry<T>>;
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 60000) {
    this.store = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Retrieves a cached value if it exists and has not expired.
   * @param key - The cache key to look up.
   * @returns The cached value, or undefined if not found or expired.
   */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Stores a value in the cache with an optional custom TTL.
   * @param key - The cache key.
   * @param value - The value to cache.
   * @param ttlMs - Optional custom TTL in milliseconds.
   */
  set(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Checks if a key exists in the cache and is not expired.
   * @param key - The cache key to check.
   * @returns True if the key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Removes an entry from the cache.
   * @param key - The cache key to delete.
   * @returns True if the key existed before deletion.
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clears all entries from the cache.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Returns the count of non-expired entries.
   * @returns Number of valid cache entries.
   */
  size(): number {
    let count = 0;
    const now = Date.now();

    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
      } else {
        count++;
      }
    }

    return count;
  }

  /**
   * Returns an array of non-expired cache keys.
   * @returns Array of valid cache keys.
   */
  keys(): string[] {
    const validKeys: string[] = [];
    const now = Date.now();

    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
      } else {
        validKeys.push(key);
      }
    }

    return validKeys;
  }
}

export function createCache<T>(ttlMs?: number): MemoryCache<T> {
  return new MemoryCache<T>(ttlMs);
}