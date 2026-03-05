import { useState, useCallback } from 'react';

export interface UseClipboardReturn {
  copy: (text: string) => Promise<void>;
  copied: boolean;
  error: Error | null;
}

/**
 * Hook for clipboard copy operations with a 'copied' status indicator.
 *
 * Usage:
 * const { copy, copied, error } = useClipboard(2000);
 * <button onClick={() => copy('hello')}>
 *   {copied ? 'Copied!' : 'Copy'}
 * </button>
 *
 * @param resetDelay - ms before 'copied' resets to false (default 2000)
 */
export function useClipboard(resetDelay: number = 2000): UseClipboardReturn {
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const copy = useCallback(
    async (text: string): Promise<void> => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setError(null);
        setTimeout(() => setCopied(false), resetDelay);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Copy failed'));
        setCopied(false);
      }
    },
    [resetDelay]
  );

  return { copy, copied, error };
}