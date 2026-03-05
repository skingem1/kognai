/** Copies text to clipboard via modern Clipboard API. @param text - Text to copy. @returns Promise<true> on success, <false> on error. */
export async function copyToClipboard(text: string): Promise<boolean> { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }

/** Reads text from clipboard via modern Clipboard API. @returns Promise with clipboard text or empty string on error. */
export async function readFromClipboard(): Promise<string> { try { return await navigator.clipboard.readText(); } catch { return ""; } }

/** Sync fallback using deprecated document.execCommand. @param text - Text to copy. @returns true on success, false on error. */
export function copyFallback(text: string): boolean { try { const el = document.createElement("textarea"); el.value = text; el.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(el); el.select(); const ok = document.execCommand("copy"); document.body.removeChild(el); return ok ?? false; } catch { return false; } }