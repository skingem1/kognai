import { useState, useEffect, RefCallback } from 'react';

/**
 * Hook to observe element intersection with viewport or a container.
 * @param options - IntersectionObserver configuration (threshold, root, rootMargin)
 * @returns Object with ref callback, isIntersecting state, and raw entry
 */
export function useIntersectionObserver(options?: IntersectionObserverInit): {
  ref: RefCallback<Element>;
  isIntersecting: boolean;
  entry: IntersectionObserverEntry | null;
} {
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const [node, setNode] = useState<Element | null>(null);

  const ref: RefCallback<Element> = (element) => setNode(element);

  useEffect(() => {
    if (!node) return;
    const observer = new IntersectionObserver(
      ([e]) => setEntry(e),
      { threshold: options?.threshold, root: options?.root, rootMargin: options?.rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, options?.threshold, options?.root, options?.rootMargin]);

  return { ref, isIntersecting: entry?.isIntersecting ?? false, entry };
}