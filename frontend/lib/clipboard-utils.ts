/**
 * Clipboard utility functions for copying and reading clipboard content.
 * Uses navigator.clipboard API with fallbacks for broader browser support.
 */

/**
 * Copies text to the clipboard using the modern Clipboard API.
 * @param text - The text to copy to the clipboard
 * @returns Promise resolving to true on success, false on failure
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads text from the clipboard using the modern Clipboard API.
 * @returns Promise resolving to clipboard text on success, null on failure
 */
export async function readFromClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/**
 * Selects all text content within the given HTML element.
 * @param element - The element containing text to select
 */
export function selectAllText(element: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/**
 * Synchronously copies text to clipboard using execCommand fallback.
 * @param text - The text to copy to the clipboard
 * @returns true on success, false on failure
 */
export function copyWithFallback(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const success = document.execCommand('copy');
  document.body.removeChild(textarea);
  return success;
}

/**
 * Formats a record/object as a JSON string for clipboard storage.
 * @param data - The data object to format
 * @returns JSON string with 2-space indentation
 */
export function formatForClipboard(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2);
}