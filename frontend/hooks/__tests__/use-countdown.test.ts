import { renderHook, act } from '@testing-library/react';
import { useCountdown } from '../use-countdown';

describe('useCountdown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('initial state: timeLeft=5000, isRunning=false, isComplete=false', () => {
    const { result } = renderHook(() => useCountdown(5000));
    expect(result.current.timeLeft).toBe(5000);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isComplete).toBe(false);
  });

  it('start begins countdown: call start(), isRunning=true', () => {
    const { result } = renderHook(() => useCountdown(5000));
    act(() => result.current.start());
    expect(result.current.isRunning).toBe(true);
  });

  it('timeLeft decreases after start', () => {
    const { result } = renderHook(() => useCountdown(5000));
    act(() => result.current.start());
    act(() => jest.advanceTimersByTime(1000));
    expect(result.current.timeLeft).toBeGreaterThanOrEqual(3800);
    expect(result.current.timeLeft).toBeLessThanOrEqual(4200);
  });

  it('pause stops countdown', () => {
    const { result } = renderHook(() => useCountdown(5000));
    act(() => result.current.start());
    act(() => jest.advanceTimersByTime(1000));
    act(() => result.current.pause());
    act(() => jest.advanceTimersByTime(2000));
    expect(result.current.timeLeft).toBeGreaterThanOrEqual(3800);
    expect(result.current.timeLeft).toBeLessThanOrEqual(4200);
  });

  it('reset restores initial state', () => {
    const { result } = renderHook(() => useCountdown(5000));
    act(() => result.current.start());
    act(() => jest.advanceTimersByTime(2000));
    act(() => result.current.reset());
    expect(result.current.timeLeft).toBe(5000);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isComplete).toBe(false);
  });

  it('completes at zero', () => {
    const { result } = renderHook(() => useCountdown(5000));
    act(() => result.current.start());
    act(() => jest.advanceTimersByTime(5100));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.timeLeft).toBe(0);
  });

  it('does not go below zero', () => {
    const { result } = renderHook(() => useCountdown(5000));
    act(() => result.current.start());
    act(() => jest.advanceTimersByTime(10000));
    expect(result.current.timeLeft).toBe(0);
  });

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useCountdown(5000));
    act(() => unmount());
    expect(() => act(() => jest.advanceTimersByTime(1000))).not.toThrow();
  });
});