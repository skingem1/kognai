import { renderHook, act } from '@testing-library/react';
import { useThrottle } from '../use-throttle';

describe('useThrottle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useThrottle('hello', 500));
    expect(result.current).toBe('hello');
  });

  it('throttles rapid updates', () => {
    const { result, rerender } = renderHook(({ value }) => useThrottle(value, 500), { initialProps: { value: 1 } });
    rerender({ value: 2 });
    expect(result.current).toBe(1);
    act(() => jest.advanceTimersByTime(500));
    expect(result.current).toBe(2);
  });

  it('updates immediately after limit expires', () => {
    const { result, rerender } = renderHook(({ value }) => useThrottle(value, 200), { initialProps: { value: 1 } });
    act(() => jest.advanceTimersByTime(200));
    rerender({ value: 2 });
    expect(result.current).toBe(2);
  });

  it('works with different types', () => {
    const { result, rerender } = renderHook(({ value }) => useThrottle(value, 100), { initialProps: { value: { a: 1 } } });
    rerender({ value: { a: 2 } });
    act(() => jest.advanceTimersByTime(100));
    expect(result.current).toEqual({ a: 2 });
  });

  it('cleans up timeout on unmount', () => {
    const { rerender, unmount } = renderHook(({ value }) => useThrottle(value, 500), { initialProps: { value: 1 } });
    rerender({ value: 2 });
    unmount();
    expect(() => act(() => jest.advanceTimersByTime(500))).not.toThrow();
  });
});