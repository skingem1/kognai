import { useState, useEffect } from 'react';

/**
 * Hook to track the current scroll position of the window.
 * @returns An object containing the current scroll position (x, y).
 */
export function useScrollPosition(): { x: number; y: number } {
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const handler = () => setPosition({ x: window.scrollX, y: window.scrollY });
    handler();
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return position;
}