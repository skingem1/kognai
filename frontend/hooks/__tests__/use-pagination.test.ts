import { renderHook, act } from '@testing-library/react';
import { usePagination } from '../use-pagination';

describe('usePagination', () => {
  it('defaults: page=1, pageSize=10, totalItems=0, totalPages=1', () => {
    const { result } = renderHook(() => usePagination());
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(10);
    expect(result.current.totalItems).toBe(0);
    expect(result.current.totalPages).toBe(1);
  });

  it('custom initial values', () => {
    const { result } = renderHook(() => usePagination({ initialPage: 2, initialPageSize: 20, initialTotal: 100 }));
    expect(result.current.page).toBe(2);
    expect(result.current.totalPages).toBe(5);
  });

  it('nextPage increments: setTotalItems(50), nextPage(); expect page=2', () => {
    const { result } = renderHook(() => usePagination());
    act(() => { result.current.setTotalItems(50); });
    act(() => { result.current.nextPage(); });
    expect(result.current.page).toBe(2);
  });

  it('prevPage decrements: set page to 3, prevPage(); expect page=2', () => {
    const { result } = renderHook(() => usePagination({ initialTotal: 100 }));
    act(() => { result.current.goToPage(3); });
    act(() => { result.current.prevPage(); });
    expect(result.current.page).toBe(2);
  });

  it('prevPage clamps to 1: on page 1, prevPage(); still page=1', () => {
    const { result } = renderHook(() => usePagination());
    act(() => { result.current.prevPage(); });
    expect(result.current.page).toBe(1);
  });

  it('nextPage clamps to totalPages: totalItems=20, pageSize=10, go to page 2, nextPage(); still page=2', () => {
    const { result } = renderHook(() => usePagination({ initialTotal: 20, initialPageSize: 10 }));
    act(() => { result.current.goToPage(2); });
    act(() => { result.current.nextPage(); });
    expect(result.current.page).toBe(2);
  });

  it('goToPage works: goToPage(3); expect page=3', () => {
    const { result } = renderHook(() => usePagination({ initialTotal: 100 }));
    act(() => { result.current.goToPage(3); });
    expect(result.current.page).toBe(3);
  });

  it('goToPage clamps low: goToPage(0); expect page=1', () => {
    const { result } = renderHook(() => usePagination());
    act(() => { result.current.goToPage(0); });
    expect(result.current.page).toBe(1);
  });

  it('goToPage clamps high: goToPage(999); expect page=totalPages', () => {
    const { result } = renderHook(() => usePagination({ initialTotal: 50 }));
    act(() => { result.current.goToPage(999); });
    expect(result.current.page).toBe(5);
  });

  it('setPageSize resets to page 1: go to page 3, setPageSize(20); expect page=1', () => {
    const { result } = renderHook(() => usePagination({ initialTotal: 100, initialPageSize: 10 }));
    act(() => { result.current.goToPage(3); });
    act(() => { result.current.setPageSize(20); });
    expect(result.current.page).toBe(1);
  });

  it('setTotalItems clamps page: 100 items, pageSize=10, setTotalItems(30); expect page=3', () => {
    const { result } = renderHook(() => usePagination({ initialTotal: 100, initialPageSize: 10 }));
    act(() => { result.current.goToPage(10); });
    act(() => { result.current.setTotalItems(30); });
    expect(result.current.page).toBe(3);
  });
});