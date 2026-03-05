import { useState, useEffect } from 'react';

/** Window dimensions interface */
interface WindowSize {
  width: number;
  height: number;
}

/**
 * React hook that tracks browser window dimensions with debounced resize handling.
 * @returns WindowSize object containing current width and height
 */
export function useWindowSize(): WindowSize {
  const getSize = (): WindowSize => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  });

  const [size, setSize] = useState<WindowSize>(getSize);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setSize(getSize), 150);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  return size;
}