/**
 * Copy data as formatted JSON to clipboard
 * @param data - Data to copy
 * @returns Promise resolving to true on success, false on error
 */
export async function copyJson(data: unknown): Promise<boolean> {
  const text = JSON.stringify(data, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy HTML string to clipboard
 * @param html - HTML to copy
 * @returns Promise resolving to true on success, false on error
 */
export async function copyHtml(html: string): Promise<boolean> {
  try {
    const blob = new Blob([html], { type: 'text/html' });
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy text with success/error callbacks
 * @param text - Text to copy
 * @param onSuccess - Called on success
 * @param onError - Called on error
 * @returns Promise resolving to true on success, false on error
 */
export async function copyWithNotification(
  text: string,
  onSuccess?: () => void,
  onError?: (err: Error) => void
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    onSuccess?.();
    return true;
  } catch (e) {
    onError?.(e as Error);
    return false;
  }
}

/**
 * Read text items from clipboard
 * @returns Promise resolving to array of text strings
 */
export async function readClipboardItems(): Promise<string[]> {
  try {
    const items = await navigator.clipboard.read();
    const texts: string[] = [];
    for (const item of items) {
      const blob = await item.getType('text/plain');
      const text = await blob.text();
      texts.push(text);
    }
    return texts;
  } catch {
    return [];
  }
}