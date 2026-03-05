import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../use-debounce';

describe('useDebounce', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 300));
    expect(result.current).toBe('initial');
  });

  it('returns old value before delay expires', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 300 } }
    );
    expect(result.current).toBe('initial');
    rerender({ value: 'updated', delay: 300 });
    act(() => { jest.advanceTimersByTime(200); });
    expect(result.current).toBe('initial');
  });

  it('returns new value after delay expires', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 300 } }
    );
    expect(result.current).toBe('initial');
    rerender({ value: 'updated', delay: 300 });
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe('updated');
  });

  it('respects custom delay of 500ms', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    );
    rerender({ value: 'updated', delay: 500 });
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe('initial');
    act(() => { jest.advanceTimersByTime(200); });
    expect(result.current).toBe('updated');
  });

  it('uses latest value after rapid changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 300 } }
    );
    rerender({ value: 'first', delay: 300 });
    rerender({ value: 'second', delay: 300 });
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe('second');
  });
});