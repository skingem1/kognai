import { renderHook, act } from '@testing-library/react';
import { useScrollPosition } from '../use-scroll-position';

describe('useScrollPosition', () => {
  afterEach(() => {
    Object.defineProperty(window, 'scrollX', { value: 0, writable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
  });

  it('returns initial position {x:0, y:0}', () => {
    const { result } = renderHook(() => useScrollPosition());
    expect(result.current).toEqual({ x: 0, y: 0 });
  });

  it('updates on scroll event', () => {
    Object.defineProperty(window, 'scrollX', { value: 100, writable: true });
    Object.defineProperty(window, 'scrollY', { value: 200, writable: true });
    const { result } = renderHook(() => useScrollPosition());
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(result.current).toEqual({ x: 100, y: 200 });
  });

  it('cleans up on unmount', () => {
    const spy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useScrollPosition());
    unmount();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});