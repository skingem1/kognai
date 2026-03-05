/**
 * Returns the first element matching the selector.
 * @param selector - CSS selector string
 * @returns The matching element or null if not found
 */
export function getElement<T extends HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

/**
 * Returns all elements matching the selector.
 * @param selector - CSS selector string
 * @returns Array of matching elements
 */
export function getElements<T extends HTMLElement>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

/**
 * Adds CSS classes to an element.
 * @param el - The target HTML element
 * @param classes - CSS classes to add
 * @returns void
 */
export function addClass(el: HTMLElement, ...classes: string[]): void {
  el.classList.add(...classes);
}

/**
 * Removes CSS classes from an element.
 * @param el - The target HTML element
 * @param classes - CSS classes to remove
 * @returns void
 */
export function removeClass(el: HTMLElement, ...classes: string[]): void {
  el.classList.remove(...classes);
}

/**
 * Toggles a CSS class on an element.
 * @param el - The target HTML element
 * @param className - CSS class to toggle
 * @param force - Optional boolean to force add or remove
 * @returns true if the class was added, false if removed
 */
export function toggleClass(el: HTMLElement, className: string, force?: boolean): boolean {
  return el.classList.toggle(className, force);
}

/**
 * Applies multiple style properties to an element.
 * @param el - The target HTML element
 * @param styles - Object containing CSS style properties
 * @returns void
 */
export function setStyles(el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, styles);
}

/**
 * Gets a data attribute value from an element.
 * @param el - The target HTML element
 * @param key - The data attribute key (without 'data-' prefix)
 * @returns The attribute value or undefined if not set
 */
export function getDataAttr(el: HTMLElement, key: string): string | undefined {
  return el.dataset[key];
}

/**
 * Sets a data attribute on an element.
 * @param el - The target HTML element
 * @param key - The data attribute key (without 'data-' prefix)
 * @param value - The value to set
 * @returns void
 */
export function setDataAttr(el: HTMLElement, key: string, value: string): void {
  el.dataset[key] = value;
}