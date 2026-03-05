import { useEffect, useRef } from 'react';

/**
 * Hook for declarative intervals.
 * @param callback - Function to call on each interval tick
 * @param delay - Delay in milliseconds, or null to pause the interval
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}