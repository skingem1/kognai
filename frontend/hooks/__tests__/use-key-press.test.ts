import { renderHook, act } from '@testing-library/react';
import { useKeyPress } from '../use-key-press';

describe('useKeyPress', () => {
  it('returns false initially', () => {
    const { result } = renderHook(() => useKeyPress('Enter'));
    expect(result.current).toBe(false);
  });

  it('returns true when key is pressed', () => {
    const { result } = renderHook(() => useKeyPress('Enter'));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    expect(result.current).toBe(true);
  });

  it('returns false when key is released', () => {
    const { result } = renderHook(() => useKeyPress('Enter'));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    });
    expect(result.current).toBe(false);
  });

  it('ignores other keys', () => {
    const { result } = renderHook(() => useKeyPress('Enter'));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current).toBe(false);
  });

  it('cleans up on unmount', () => {
    const spy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useKeyPress('a'));
    unmount();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});