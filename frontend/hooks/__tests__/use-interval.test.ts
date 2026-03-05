import { renderHook, act } from '@testing-library/react';
import { useInterval } from '../use-interval';

describe('useInterval', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('calls callback at interval', () => {
    const callback = jest.fn();
    renderHook(() => useInterval(callback, 100));
    act(() => { jest.advanceTimersByTime(300); });
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('does not call when delay is null', () => {
    const callback = jest.fn();
    renderHook(() => useInterval(callback, null));
    act(() => { jest.advanceTimersByTime(500); });
    expect(callback).not.toHaveBeenCalled();
  });

  it('pauses when delay changes to null', () => {
    const callback = jest.fn();
    const { rerender } = renderHook(({ delay }) => useInterval(callback, delay), { initialProps: { delay: 100 } });
    act(() => { jest.advanceTimersByTime(200); });
    expect(callback).toHaveBeenCalledTimes(2);
    rerender({ delay: null });
    act(() => { jest.advanceTimersByTime(300); });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('restarts with new delay', () => {
    const callback = jest.fn();
    const { rerender } = renderHook(({ delay }) => useInterval(callback, delay), { initialProps: { delay: 100 } });
    act(() => { jest.advanceTimersByTime(100); });
    expect(callback).toHaveBeenCalledTimes(1);
    rerender({ delay: 200 });
    act(() => { jest.advanceTimersByTime(200); });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('uses latest callback', () => {
    const callback = jest.fn();
    const { rerender } = renderHook(({ fn }) => useInterval(fn, 100), { initialProps: { fn: callback } });
    const callback2 = jest.fn();
    rerender({ fn: callback2 });
    act(() => { jest.advanceTimersByTime(100); });
    expect(callback).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledTimes(1);
  });

  it('cleans up on unmount', () => {
    const callback = jest.fn();
    const { unmount } = renderHook(() => useInterval(callback, 100));
    unmount();
    act(() => { jest.advanceTimersByTime(500); });
    expect(callback).not.toHaveBeenCalled();
  });
});