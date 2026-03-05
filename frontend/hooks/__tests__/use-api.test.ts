import { renderHook, waitFor } from '@testing-library/react';
import { useApi } from '../use-api';

describe('useApi', () => {
  it('initializes with loading true and null data/error', () => {
    const fetcher = jest.fn().mockResolvedValue('data');
    const { result } = renderHook(() => useApi(fetcher));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('sets data on success', async () => {
    const fetcher = jest.fn().mockResolvedValue({ id: 1, name: 'Test' });
    const { result } = renderHook(() => useApi<{id:number;name:string}>(fetcher));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ id: 1, name: 'Test' });
    expect(result.current.error).toBeNull();
  });

  it('clears data on error', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toEqual(new Error('fail'));
    expect(result.current.data).toBeNull();
  });

  it('clears data when error follows success', async () => {
    let shouldFail = false;
    const fetcher = jest.fn().mockImplementation(() => 
      shouldFail ? Promise.reject(new Error('fail')) : Promise.resolve({ id: 1 })
    );
    const { result, rerender } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.data).toEqual({ id: 1 }));
    shouldFail = true;
    rerender();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it('re-executes when deps change', async () => {
    const fetcher = jest.fn().mockResolvedValue('data');
    const { result, rerender } = renderHook((props) => useApi(fetcher, [props?.dep]), { initialProps: { dep: 1 } });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    rerender({ dep: 2 });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBe('data');
  });

  it('refetch triggers new fetch', async () => {
    const fetcher = jest.fn().mockResolvedValue('data');
    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const callCount = fetcher.mock.calls.length;
    result.current.refetch();
    await waitFor(() => expect(fetcher.mock.calls.length).toBe(callCount + 1));
  });
});