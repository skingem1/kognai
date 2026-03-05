import { useState, useEffect, useCallback, useRef } from 'react';

interface CountdownState {
  timeLeft: number;
  isRunning: boolean;
  isComplete: boolean;
}

interface CountdownActions {
  start: () => void;
  pause: () => void;
  reset: () => void;
}

/**
 * Custom hook for managing countdown timers with millisecond precision.
 * @param durationMs - Initial countdown duration in milliseconds
 * @returns Countdown state and control actions
 */
function useCountdown(durationMs: number): CountdownState & CountdownActions {
  const [timeLeft, setTimeLeft] = useState(durationMs);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (timeLeft > 0) {
      setIsRunning(true);
      setIsComplete(false);
    }
  }, [timeLeft]);

  const pause = useCallback(() => {
    setIsRunning(false);
    clearTimer();
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setIsRunning(false);
    setIsComplete(false);
    setTimeLeft(durationMs);
  }, [durationMs, clearTimer]);

  // Reset when duration changes while not running
  useEffect(() => {
    if (!isRunning && !isComplete) {
      setTimeLeft(durationMs);
    }
  }, [durationMs, isRunning, isComplete]);

  // Main countdown interval
  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 100) {
          clearTimer();
          setIsRunning(false);
          setIsComplete(true);
          return 0;
        }
        return prev - 100;
      });
    }, 100);
    return clearTimer;
  }, [isRunning, clearTimer]);

  return { timeLeft, isRunning, isComplete, start, pause, reset };
}

export { useCountdown };