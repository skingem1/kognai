import { renderHook, act, waitFor } from '@testing-library/react';
import { useAsync } from '../use-async';

describe('useAsync', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useAsync());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('sets loading then data on success', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const { result } = renderHook(() => useAsync(fn));
    await act(async () => {
      await result.current.execute();
    });
    expect(result.current.data).toBe('result');
    expect(result.current.isSuccess).toBe(true);
  });

  it('isLoading during execution', async () => {
    let resolveFn: (v: string) => void;
    const fn = jest.fn(() => new Promise(r => { resolveFn = r; }));
    const { result } = renderHook(() => useAsync(fn));
    act(() => { result.current.execute(); });
    expect(result.current.isLoading).toBe(true);
    await act(async () => { resolveFn!('ok'); });
  });

  it('sets error on rejection', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useAsync(fn));
    await act(async () => { await result.current.execute(); });
    expect(result.current.isError).toBe(true);
    expect(result.current.error?.message).toBe('fail');
  });

  it('data is null on error', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useAsync(fn));
    await act(async () => { await result.current.execute(); });
    expect(result.current.data).toBeNull();
  });

  it('reset clears state', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const { result } = renderHook(() => useAsync(fn));
    await act(async () => { await result.current.execute(); });
    act(() => result.current.reset());
    expect(result.current.data).toBeNull();
    expect(result.current.isSuccess).toBe(false);
  });

  it('passes args to fn', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const { result } = renderHook(() => useAsync(fn));
    await act(async () => { await result.current.execute('a', 'b'); });
    expect(fn).toHaveBeenCalledWith('a', 'b');
  });

  it('execute with no fn returns null', async () => {
    const { result } = renderHook(() => useAsync());
    const r = await act(async () => result.current.execute());
    expect(result.current.data).toBeNull();
  });
});