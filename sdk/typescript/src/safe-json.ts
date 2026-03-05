/**
 * @fileoverview Safe JSON parsing and stringification utilities
 * @module safe-json
 */

/**
 * Safely parses a JSON string, returning a fallback value or undefined on failure.
 * @param json - The JSON string to parse
 * @param fallback - Optional fallback value to return on parse failure
 * @returns The parsed value, fallback, or undefined
 */
export function safeParse<T = unknown>(json: string, fallback?: T): T | undefined {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safely stringifies a value to JSON, returning undefined on failure.
 * @param value - The value to stringify
 * @param indent - Optional indentation for pretty printing
 * @returns The JSON string or undefined on failure
 */
export function safeStringify(value: unknown, indent?: number): string | undefined {
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return undefined;
  }
}

/**
 * Parses a JSON string and throws an error if parsing fails.
 * @param json - The JSON string to parse
 * @param errorMessage - Custom error message
 * @returns The parsed value
 * @throws Error if JSON parsing fails
 */
export function parseOrThrow<T = unknown>(json: string, errorMessage?: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new Error(errorMessage || `Invalid JSON: ${json.slice(0, 100)}`);
  }
}

/**
 * Checks if a string is valid JSON.
 * @param value - The string to validate
 * @returns True if valid JSON, false otherwise
 */
export function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deep clones a value using structuredClone or JSON fallback.
 * @param value - The value to clone
 * @returns A deep clone of the value
 */
export function deepClone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Pretty prints a value as JSON, falling back to String conversion.
 * @param value - The value to print
 * @returns A pretty-printed JSON string
 */
export function prettyPrint(value: unknown): string {
  return safeStringify(value, 2) || String(value);
}