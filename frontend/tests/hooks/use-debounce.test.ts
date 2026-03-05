import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../../hooks/use-debounce';

describe('useDebounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 500));
    expect(result.current).toBe('hello');
  });

  it('does not update before delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'hello' } }
    );
    rerender({ value: 'world' });
    act(() => jest.advanceTimersByTime(499));
    expect(result.current).toBe('hello');
  });

  it('updates after delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'hello' } }
    );
    rerender({ value: 'world' });
    act(() => jest.advanceTimersByTime(500));
    expect(result.current).toBe('world');
  });

  it('uses default delay of 300ms', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value),
      { initialProps: { value: 'a' } }
    );
    rerender({ value: 'b' });
    act(() => jest.advanceTimersByTime(299));
    expect(result.current).toBe('a');
    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe('b');
  });

  it('resets timer on rapid changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } }
    );
    rerender({ value: 'a' });
    rerender({ value: 'b' });
    rerender({ value: 'c' });
    act(() => jest.advanceTimersByTime(300));
    expect(result.current).toBe('c');
  });
});