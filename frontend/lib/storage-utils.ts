/**
 * Safe wrapper utilities for localStorage and sessionStorage.
 * All functions are SSR-safe and handle errors gracefully.
 */

/**
 * Get the storage object (localStorage or sessionStorage)
 * @param type - Storage type: 'local' or 'session'
 * @returns Storage object or null if unavailable/SSR
 */
function getStorage(type: 'local' | 'session'): Storage | null {
  if (typeof window === 'undefined') return null;
  return type === 'local' ? window.localStorage : window.sessionStorage;
}

/**
 * Safely get an item from storage
 * @param key - The key to retrieve
 * @param storage - Storage type ('local' or 'session'), defaults to 'local'
 * @returns The stored value or null if not found/error
 */
export function safeGetItem(key: string, storage: 'local' | 'session' = 'local'): string | null {
  try {
    const store = getStorage(storage);
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Safely set an item in storage
 * @param key - The key to set
 * @param value - The value to store
 * @param storage - Storage type ('local' or 'session'), defaults to 'local'
 * @returns True on success, false on error
 */
export function safeSetItem(key: string, value: string, storage: 'local' | 'session' = 'local'): boolean {
  try {
    const store = getStorage(storage);
    if (!store) return false;
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely remove an item from storage
 * @param key - The key to remove
 * @param storage - Storage type ('local' or 'session'), defaults to 'local'
 * @returns True on success, false on error
 */
export function safeRemoveItem(key: string, storage: 'local' | 'session' = 'local'): boolean {
  try {
    const store = getStorage(storage);
    if (!store) return false;
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a JSON item from storage with fallback
 * @param key - The key to retrieve
 * @param fallback - Fallback value if item is null or parsing fails
 * @param storage - Storage type ('local' or 'session'), defaults to 'local'
 * @returns Parsed JSON value or fallback
 */
export function getJSON<T>(key: string, fallback: T, storage: 'local' | 'session' = 'local'): T {
  const item = safeGetItem(key, storage);
  if (!item) return fallback;
  try {
    return JSON.parse(item) as T;
  } catch {
    return fallback;
  }
}

/**
 * Set a JSON item in storage
 * @param key - The key to set
 * @param value - The value to JSON.stringify and store
 * @param storage - Storage type ('local' or 'session'), defaults to 'local'
 * @returns True on success, false on error
 */
export function setJSON<T>(key: string, value: T, storage: 'local' | 'session' = 'local'): boolean {
  try {
    return safeSetItem(key, JSON.stringify(value), storage);
  } catch {
    return false;
  }
}

/**
 * Clear all items from storage
 * @param storage - Storage type ('local' or 'session'), defaults to 'local'
 * @returns True on success, false on error
 */
export function clearStorage(storage: 'local' | 'session' = 'local'): boolean {
  try {
    const store = getStorage(storage);
    if (!store) return false;
    store.clear();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all keys from storage
 * @param storage - Storage type ('local' or 'session'), defaults to 'local'
 * @returns Array of keys, empty array on error
 */
export function getStorageKeys(storage: 'local' | 'session' = 'local'): string[] {
  try {
    const store = getStorage(storage);
    if (!store) return [];
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key !== null) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}