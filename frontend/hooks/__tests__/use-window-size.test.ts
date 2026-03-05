import { renderHook, act } from '@testing-library/react';
import { useWindowSize } from '../use-window-size';

describe('useWindowSize', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 768 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns initial dimensions', () => {
    const { result } = renderHook(() => useWindowSize());
    expect(result.current.width).toBe(1024);
    expect(result.current.height).toBe(768);
  });

  it('updates on resize', () => {
    const { result } = renderHook(() => useWindowSize());
    act(() => {
      window.innerWidth = 800;
      window.dispatchEvent(new Event('resize'));
    });
    act(() => jest.advanceTimersByTime(200));
    expect(result.current.width).toBe(800);
  });

  it('debounces rapid resizes', () => {
    const { result } = renderHook(() => useWindowSize());
    act(() => {
      window.innerWidth = 800;
      window.dispatchEvent(new Event('resize'));
      window.innerWidth = 600;
      window.dispatchEvent(new Event('resize'));
      window.innerWidth = 400;
      window.dispatchEvent(new Event('resize'));
    });
    act(() => jest.advanceTimersByTime(200));
    expect(result.current.width).toBe(400);
  });

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useWindowSize());
    unmount();
    act(() => {
      window.innerWidth = 800;
      window.dispatchEvent(new Event('resize'));
    });
    act(() => jest.advanceTimersByTime(200));
  });
});