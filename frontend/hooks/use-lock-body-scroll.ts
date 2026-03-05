import { useEffect } from 'react';

/**
 * Hook to lock body scroll when a modal or overlay is open.
 * @param lock - Whether to lock the body scroll (default: true)
 */
export function useLockBodyScroll(lock: boolean = true): void {
  useEffect(() => {
    if (!lock) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [lock]);
}