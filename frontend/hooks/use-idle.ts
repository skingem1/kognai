import { useState, useEffect } from 'react';

/**
 * React hook for detecting user idle state.
 * @param timeout - Time in ms before considering user idle (default: 30000)
 * @returns boolean - true if user is idle, false otherwise
 */
export function useIdle(timeout: number = 30000): boolean {
  const [idle, setIdle] = useState<boolean>(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => { setIdle(false); clearTimeout(timer); timer = setTimeout(() => setIdle(true), timeout); };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    resetTimer();
    events.forEach((e) => window.addEventListener(e, resetTimer));
    return () => { events.forEach((e) => window.removeEventListener(e, resetTimer)); clearTimeout(timer); };
  }, [timeout]);

  return idle;
}