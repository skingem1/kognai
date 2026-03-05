import { useState, useMemo } from 'react';

/**
 * Interface representing the current pagination state.
 */
interface PaginationState {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Interface representing pagination actions.
 */
interface PaginationActions {
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setPageSize: (size: number) => void;
  setTotalItems: (total: number) => void;
}

/**
 * Calculates total pages based on total items and page size.
 */
const calculateTotalPages = (total: number, size: number): number => {
  if (total === 0) return 1;
  return Math.ceil(total / size);
};

/**
 * Custom hook for managing client-side pagination state.
 * @param options - Optional configuration with initialPage, initialPageSize, and initialTotal
 * @returns Pagination state and actions
 */
function usePagination(
  options?: { initialPage?: number; initialPageSize?: number; initialTotal?: number }
): PaginationState & PaginationActions {
  const [page, setPage] = useState(options?.initialPage ?? 1);
  const [pageSize, setPageSize] = useState(options?.initialPageSize ?? 10);
  const [totalItems, setTotalItems] = useState(options?.initialTotal ?? 0);

  const totalPages = useMemo(
    () => calculateTotalPages(totalItems, pageSize),
    [totalItems, pageSize]
  );

  const goToPage = (targetPage: number) => {
    const clamped = Math.max(1, Math.min(targetPage, totalPages));
    setPage(clamped);
  };

  const nextPage = () => goToPage(page + 1);
  const prevPage = () => goToPage(page - 1);

  const handleSetPageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const handleSetTotalItems = (total: number) => {
    const newTotalPages = calculateTotalPages(total, pageSize);
    setTotalItems(total);
    if (page > newTotalPages) {
      setPage(newTotalPages);
    }
  };

  return { page, pageSize, totalItems, totalPages, goToPage, nextPage, prevPage, setPageSize: handleSetPageSize, setTotalItems: handleSetTotalItems };
}

export { usePagination };