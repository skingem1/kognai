import { useState, useEffect } from 'react';

/**
 * Hook to detect if a specific key is currently pressed.
 * @param targetKey - The key to listen for (e.g., 'Escape', 'Enter')
 * @returns true when the key is pressed, false otherwise
 */
export function useKeyPress(targetKey: string): boolean {
  const [pressed, setPressed] = useState<boolean>(false);

  useEffect(() => {
    const downHandler = (e: KeyboardEvent) => {
      if (e.key === targetKey) setPressed(true);
    };
    const upHandler = (e: KeyboardEvent) => {
      if (e.key === targetKey) setPressed(false);
    };

    window.addEventListener('keydown', downHandler);
    window.addEventListener('keyup', upHandler);

    return () => {
      window.removeEventListener('keydown', downHandler);
      window.removeEventListener('keyup', upHandler);
    };
  }, [targetKey]);

  return pressed;
}