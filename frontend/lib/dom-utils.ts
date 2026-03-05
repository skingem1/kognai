/**
 * DOM manipulation utilities for the frontend.
 * Pure functions, browser-only with SSR safety checks.
 */

/**
 * Scrolls the window to the top of the page.
 * @param smooth - Whether to use smooth scrolling (default: false)
 */
export function scrollToTop(smooth = false): void {
  if (typeof window === 'undefined') return;
  window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
}

/**
 * Scrolls to an element by selector with optional offset.
 * @param selector - CSS selector for the target element
 * @param offset - Additional pixel offset to scroll after positioning
 */
export function scrollToElement(selector: string, offset = 0): void {
  if (typeof window === 'undefined') return;
  const element = document.querySelector(selector);
  if (!element) return;
  element.scrollIntoView({ block: 'start', behavior: 'auto' });
  if (offset) window.scrollBy(0, offset);
}

/**
 * Gets the current scroll position.
 * @returns Object with x and y scroll coordinates
 */
export function getScrollPosition(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  return { x: window.scrollX || 0, y: window.scrollY || 0 };
}

/**
 * Checks if an element is fully visible in the viewport.
 * @param element - The DOM element to check
 * @returns True if element is within viewport bounds
 */
export function isElementInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || 0) &&
    rect.right <= (window.innerWidth || 0)
  );
}

/**
 * Gets the dimensions of an element.
 * @param element - The DOM element to measure
 * @returns Object with width and height
 */
export function getElementDimensions(element: Element): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

/**
 * Focuses an element by selector.
 * @param selector - CSS selector for the target element
 * @returns True if element was found and focused
 */
export function focusElement(selector: string): boolean {
  const element = document.querySelector(selector) as HTMLElement | null;
  if (element && typeof element.focus === 'function') {
    element.focus();
    return true;
  }
  return false;
}

/**
 * Copies text to the clipboard.
 * @param text - Text to copy
 * @returns Promise resolving to true if successful
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}