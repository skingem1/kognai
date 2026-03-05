import { renderHook } from '@testing-library/react';
import { useClickOutside, useEscapeKey } from '../use-click-outside';

describe('useClickOutside', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns ref object', () => {
    const { result } = renderHook(() => useClickOutside(jest.fn()));
    expect(result.current).toBeDefined();
  });

  it('calls handler on outside click', () => {
    const handler = jest.fn();
    const { result } = renderHook(() => useClickOutside(handler));
    const div = document.createElement('div');
    document.body.appendChild(div);
    result.current.current = div;
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(handler).toHaveBeenCalled();
  });

  it('does not call handler on inside click', () => {
    const handler = jest.fn();
    const { result } = renderHook(() => useClickOutside(handler));
    const div = document.createElement('div');
    document.body.appendChild(div);
    result.current.current = div;
    div.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call when ref is null', () => {
    const handler = jest.fn();
    renderHook(() => useClickOutside(handler));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('useEscapeKey', () => {
  it('calls handler on Escape', () => {
    const handler = jest.fn();
    renderHook(() => useEscapeKey(handler));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handler).toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const handler = jest.fn();
    renderHook(() => useEscapeKey(handler));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('cleans up on unmount', () => {
    const handler = jest.fn();
    const { unmount } = renderHook(() => useEscapeKey(handler));
    unmount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handler).not.toHaveBeenCalled();
  });
});