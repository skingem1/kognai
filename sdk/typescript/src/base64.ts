/**
 * Base64 encoding/decoding utilities for Node.js and browser.
 * @packageDocumentation
 */

/** Encodes a string to Base64. */
export function encode(input: string): string {
  if (typeof globalThis.btoa === "function") return globalThis.btoa(input);
  return Buffer.from(input, "utf-8").toString("base64");
}

/** Decodes a Base64 string. */
export function decode(input: string): string {
  if (typeof globalThis.atob === "function") return globalThis.atob(input);
  if (!isBase64(input)) throw new Error("Invalid Base64 input");
  return Buffer.from(input, "base64").toString("utf-8");
}

/** Encodes a string to URL-safe Base64. */
export function encodeUrlSafe(input: string): string {
  return encode(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes a URL-safe Base64 string. */
export function decodeUrlSafe(input: string): string {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);
  return decode(base64);
}

/** Checks if a string is valid Base64. */
export function isBase64(input: string): boolean {
  return /^[A-Za-z0-9+/]*={0,2}$/.test(input) && input.length % 4 === 0;
}

/** Checks if a string is valid URL-safe Base64. */
export function isBase64UrlSafe(input: string): boolean {
  return /^[A-Za-z0-9_-]*$/.test(input);
}