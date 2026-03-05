import { useState, useRef, useEffect, useCallback, RefObject } from 'react';

interface UseHoverResult<T extends HTMLElement = HTMLElement> {
  ref: React.RefObject<T>;
  isHovered: boolean;
}

/**
 * Hook to detect hover state on an element.
 * @returns Object containing ref and isHovered state
 */
function useHover<T extends HTMLElement = HTMLElement>(): UseHoverResult<T> {
  const ref = useRef<T>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const handleMouseEnter = () => setIsHovered(true);
    const handleMouseLeave = () => setIsHovered(false);
    element.addEventListener('mouseenter', handleMouseEnter);
    element.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      element.removeEventListener('mouseenter', handleMouseEnter);
      element.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return { ref, isHovered };
}

/**
 * Hook to detect hover with callbacks instead of state.
 * Useful for side effects without re-renders.
 */
function useHoverCallback(
  onHoverStart?: () => void,
  onHoverEnd?: () => void
): { ref: React.RefObject<HTMLElement> } {
  const ref = useRef<HTMLElement>(null);
  const handleMouseEnter = useCallback(() => onHoverStart?.(), [onHoverStart]);
  const handleMouseLeave = useCallback(() => onHoverEnd?.(), [onHoverEnd]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.addEventListener('mouseenter', handleMouseEnter);
    element.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      element.removeEventListener('mouseenter', handleMouseEnter);
      element.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleMouseEnter, handleMouseLeave]);

  return { ref };
}

export { useHover, useHoverCallback };