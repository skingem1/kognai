import { useRef, useEffect } from 'react';

/**
 * Returns the previous value of a variable.
 * On first render, returns undefined.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/**
 * Returns the last distinct previous value.
 * Only updates when compare returns true (values are different).
 */
export function usePreviousDistinct<T>(
  value: T,
  compare: (prev: T | undefined, next: T) => boolean = (prev, next) => prev !== next
): T | undefined {
  const prevRef = useRef<T | undefined>(undefined);
  const distinctRef = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (compare(prevRef.current, value)) {
      distinctRef.current = prevRef.current;
    }
    prevRef.current = value;
  }, [value, compare]);

  return distinctRef.current;
}