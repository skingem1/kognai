/**
 * Retrieves a value from localStorage, parsing JSON if possible.
 * @param key - The localStorage key to retrieve
 * @param fallback - The default value if key doesn't exist or parsing fails
 * @returns The parsed value or fallback
 */
export function getItem<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return JSON.parse(value) as T;
  } catch { return fallback; }
}

/**
 * Stores a value in localStorage as JSON.
 * @param key - The localStorage key to set
 * @param value - The value to store (will be JSON.stringified)
 * @returns True on success, false on error
 */
export function setItem<T>(key: string, value: T): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

/**
 * Removes a key from localStorage.
 * @param key - The localStorage key to remove
 * @returns True on success, false on error
 */
export function removeItem(key: string): boolean {
  try { localStorage.removeItem(key); return true; }
  catch { return false; }
}

/**
 * Clears all entries from localStorage.
 * @returns True on success, false on error
 */
export function clearAll(): boolean {
  try { localStorage.clear(); return true; }
  catch { return false; }
}

/**
 * Retrieves all keys from localStorage.
 * @returns Array of all localStorage keys, or empty array on error
 */
export function getAllKeys(): string[] {
  try {
    return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
      .filter((k): k is string => k !== null);
  } catch { return []; }
}