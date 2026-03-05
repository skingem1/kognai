import { renderHook, act } from '@testing-library/react';
import { useIntersectionObserver } from '../use-intersection-observer';

describe('useIntersectionObserver', () => {
  let mockObserve: jest.Mock;
  let mockDisconnect: jest.Mock;
  let mockCallback: (entries: Partial<IntersectionObserverEntry>[]) => void;

  beforeEach(() => {
    mockObserve = jest.fn();
    mockDisconnect = jest.fn();
    (global as any).IntersectionObserver = jest.fn((cb: any) => {
      mockCallback = cb;
      return { observe: mockObserve, disconnect: mockDisconnect, unobserve: jest.fn() };
    });
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    expect(result.current.isIntersecting).toBe(false);
    expect(result.current.entry).toBe(null);
  });

  it('ref is a function', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    expect(typeof result.current.ref).toBe('function');
  });

  it('observes element when ref is set', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    const div = document.createElement('div');
    act(() => result.current.ref(div));
    expect(mockObserve).toHaveBeenCalledWith(div);
  });

  it('disconnects on unmount', () => {
    const { result, unmount } = renderHook(() => useIntersectionObserver());
    const div = document.createElement('div');
    act(() => result.current.ref(div));
    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('updates isIntersecting when entry changes', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    const div = document.createElement('div');
    act(() => result.current.ref(div));
    act(() => mockCallback([{ isIntersecting: true }]));
    expect(result.current.isIntersecting).toBe(true);
  });
});