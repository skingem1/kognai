import { renderHook, act } from '@testing-library/react';
import { usePrevious, usePreviousDistinct } from '../use-previous';

describe('usePrevious', () => {
  it('returns undefined on first render', () => {
    const { result } = renderHook(() => usePrevious(1));
    expect(result.current).toBeUndefined();
  });

  it('returns previous after rerender', () => {
    const { result, rerender } = renderHook(({ value }) => usePrevious(value), { initialProps: { value: 1 } });
    rerender({ value: 2 });
    expect(result.current).toBe(1);
  });

  it('tracks multiple changes', () => {
    const { result, rerender } = renderHook(({ value }) => usePrevious(value), { initialProps: { value: 'a' } });
    rerender({ value: 'b' });
    expect(result.current).toBe('a');
    rerender({ value: 'c' });
    expect(result.current).toBe('b');
  });

  it('works with objects', () => {
    const { result, rerender } = renderHook(({ value }) => usePrevious(value), { initialProps: { value: { x: 1 } } });
    rerender({ value: { x: 2 } });
    expect(result.current).toEqual({ x: 1 });
  });
});

describe('usePreviousDistinct', () => {
  it('returns undefined initially', () => {
    const { result } = renderHook(() => usePreviousDistinct(1));
    expect(result.current).toBeUndefined();
  });

  it('updates on change', () => {
    const { result, rerender } = renderHook(({ v }) => usePreviousDistinct(v), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    expect(result.current).toBe(1);
  });

  it('skips same value', () => {
    const { result, rerender } = renderHook(({ v }) => usePreviousDistinct(v), { initialProps: { v: 1 } });
    rerender({ v: 1 });
    rerender({ v: 2 });
    expect(result.current).toBe(1);
  });

  it('uses custom compare function', () => {
    const compare = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    const { result, rerender } = renderHook(({ v }) => usePreviousDistinct(v, compare), { initialProps: { v: 'Hello' } });
    rerender({ v: 'hello' });
    expect(result.current).toBeUndefined();
    rerender({ v: 'World' });
    expect(result.current).toBe('Hello');
  });
});