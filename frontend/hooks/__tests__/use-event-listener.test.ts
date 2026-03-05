import { renderHook } from '@testing-library/react';
import { useEventListener } from '../use-event-listener';

describe('useEventListener', () => {
  it('attaches event listener to window by default', () => {
    const handler = jest.fn();
    renderHook(() => useEventListener('click', handler));
    window.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('removes listener on unmount', () => {
    const handler = jest.fn();
    const { unmount } = renderHook(() => useEventListener('click', handler));
    unmount();
    window.dispatchEvent(new Event('click'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('attaches to custom element', () => {
    const div = document.createElement('div');
    const handler = jest.fn();
    renderHook(() => useEventListener('click', handler, div));
    div.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalled();
  });

  it('uses latest handler', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const { rerender } = renderHook(
      ({ h }) => useEventListener('click', h),
      { initialProps: { h: handler1 } }
    );
    rerender({ h: handler2 });
    window.dispatchEvent(new Event('click'));
    expect(handler2).toHaveBeenCalled();
    expect(handler1).not.toHaveBeenCalled();
  });

  it('handles null element gracefully', () => {
    expect(() => renderHook(() => useEventListener('click', jest.fn(), null))).not.toThrow();
  });
});