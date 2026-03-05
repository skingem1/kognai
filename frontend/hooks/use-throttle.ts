import { useState, useEffect, useRef } from 'react';

/**
 * Throttles a value to update at most once per specified limit in milliseconds.
 * @template T - The type of the value being throttled
 * @param value - The value to throttle
 * @param limit - The minimum time between updates in milliseconds
 * @returns The throttled value
 */
export function useThrottle<T>(value: T, limit: number): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastUpdated = useRef(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const elapsed = Date.now() - lastUpdated.current;
    if (elapsed >= limit) {
      setThrottledValue(value);
      lastUpdated.current = Date.now();
    } else {
      const remaining = limit - elapsed;
      timeoutRef.current = setTimeout(() => {
        setThrottledValue(value);
        lastUpdated.current = Date.now();
      }, remaining);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, limit]);

  return throttledValue;
}