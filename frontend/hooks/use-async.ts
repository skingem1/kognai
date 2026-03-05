import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Represents the state of an async operation
 */
interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
}

/**
 * Represents the actions available for managing an async operation
 */
interface AsyncActions<T> {
  execute: (...args: unknown[]) => Promise<T | null>;
  reset: () => void;
}

const initialState = {
  data: null,
  error: null,
  isLoading: false,
  isSuccess: false,
  isError: false,
};

/**
 * Custom hook for managing async operation state with loading, success, and error states.
 * @param asyncFn - Optional async function to execute
 * @returns State and actions for managing the async operation
 */
export function useAsync<T>(asyncFn?: (...args: unknown[]) => Promise<T>): AsyncState<T> & AsyncActions<T> {
  const [state, setState] = useState<AsyncState<T>>(initialState);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (...args: unknown[]): Promise<T | null> => {
      if (!asyncFn) {
        return null;
      }
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const result = await asyncFn(...args);
        if (mountedRef.current) {
          setState({ data: result, error: null, isLoading: false, isSuccess: true, isError: false });
        }
        return result;
      } catch (err) {
        if (mountedRef.current) {
          setState({ data: null, error: err as Error, isLoading: false, isSuccess: false, isError: true });
        }
        return null;
      }
    },
    [asyncFn]
  );

  const reset = useCallback(() => {
    if (mountedRef.current) {
      setState(initialState);
    }
  }, []);

  return { ...state, execute, reset };
}