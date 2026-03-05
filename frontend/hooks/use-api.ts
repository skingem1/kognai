import { useState, useEffect, useCallback } from 'react';

export interface UseApiState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps?: unknown[]
): UseApiState<T> & { refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const execute = useCallback(() => {
    setIsLoading(true);
    fetcher()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => {
        setError(err);
        setData(null);
      })
      .finally(() => setIsLoading(false));
  }, deps ? [fetcher, ...deps] : [fetcher]);

  useEffect(() => {
    execute();
  }, [execute]);

  const refetch = useCallback(() => execute(), [execute]);

  return { data, error, isLoading, refetch };
}