import { useEffect, useRef } from 'react';

/**
 * Attaches an event listener to the given element (default: window).
 * @param eventName - The name of the event to listen for
 * @param handler - The event handler function
 * @param element - The target element (defaults to window if undefined)
 * @param options - Event listener options
 * @returns void
 */
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  element?: HTMLElement | Window | null,
  options?: boolean | AddEventListenerOptions
): void {
  const savedHandler = useRef(handler);
  useEffect(() => { savedHandler.current = handler; }, [handler]);
  useEffect(() => {
    const target = element ?? window;
    const listener = (e: Event) => savedHandler.current(e as WindowEventMap[K]);
    target.addEventListener(eventName, listener, options);
    return () => target.removeEventListener(eventName, listener, options);
  }, [eventName, element, options]);
}