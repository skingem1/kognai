import { useRef, useEffect, useCallback } from 'react';

interface UseFocusTrapOptions {
  enabled?: boolean;
  autoFocus?: boolean;
}

/**
 * React hook for trapping focus within an element (for modals/dialogs).
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(options?: UseFocusTrapOptions): React.RefObject<T> {
  const ref = useRef<T>(null);
  const { enabled = true, autoFocus = true } = options ?? {};

  const getFocusableElements = useCallback(() => {
    if (!ref.current) return [];
    const selector = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
    return Array.from(ref.current.querySelectorAll<HTMLElement>(selector));
  }, []);

  useEffect(() => {
    if (!enabled || !ref.current) return;
    const elements = getFocusableElements();
    if (autoFocus && elements.length > 0) elements[0].focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const foci = getFocusableElements();
      if (!foci.length) return;
      if (e.shiftKey && document.activeElement === foci[0]) { e.preventDefault(); foci[foci.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === foci[foci.length - 1]) { e.preventDefault(); foci[0].focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled, autoFocus, getFocusableElements]);

  return ref;
}