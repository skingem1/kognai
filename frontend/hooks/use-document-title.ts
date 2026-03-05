import { useEffect } from 'react';

/**
 * Sets the document title to the provided value.
 * @param title - The title to set on the document
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}