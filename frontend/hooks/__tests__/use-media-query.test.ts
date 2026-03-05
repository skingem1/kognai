import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from '../use-media-query';

function createMatchMedia(matches: boolean) {
  const listeners: Array<(e: any) => void> = [];
  return {
    matches,
    addEventListener: jest.fn((event: string, handler: any) => { listeners.push(handler); }),
    removeEventListener: jest.fn((event: string, handler: any) => {
      const idx = listeners.indexOf(handler);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
    _trigger(newMatches: boolean) {
      listeners.forEach(fn => fn({ matches: newMatches }));
    }
  };
}

describe('useMediaQuery', () => {
  let mockMatchMedia: jest.Mock;

  beforeEach(() => {
    mockMatchMedia = jest.fn().mockImplementation(() => createMatchMedia(false));
    window.matchMedia = mockMatchMedia;
  });

  it('returns false when media query does not match', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('returns true when media query matches', () => {
    mockMatchMedia.mockImplementation(() => createMatchMedia(true));
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('updates when media query change fires', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
    const mock = mockMatchMedia.mock.results[0].value as any;
    act(() => mock._trigger(true));
    expect(result.current).toBe(true);
  });

  it('cleans up listener on unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    const mock = mockMatchMedia.mock.results[0].value as any;
    unmount();
    expect(mock.removeEventListener).toHaveBeenCalled();
  });

  it('updates when query prop changes', () => {
    const { result, rerender } = renderHook(({ query }: { query: string }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 768px)' }
    });
    rerender({ query: '(min-width: 1024px)' });
    expect(mockMatchMedia).toHaveBeenCalledWith('(min-width: 1024px)');
  });

  it('handles SSR with default false', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });
});