import { renderHook, act } from '@testing-library/react';
import { useHover, useHoverCallback } from '../use-hover';

describe('useHover', () => {
  it('initial state: isHovered is false', () => {
    const { result } = renderHook(() => useHover());
    expect(result.current.isHovered).toBe(false);
  });

  it('ref is defined with current property', () => {
    const { result } = renderHook(() => useHover());
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref).toHaveProperty('current');
  });

  it('detects hover state on mouseenter', () => {
    const { result } = renderHook(() => useHover());
    const div = document.createElement('div');
    Object.defineProperty(result.current.ref, 'current', { value: div, writable: true });
    act(() => { div.dispatchEvent(new Event('mouseenter')); });
    expect(result.current.isHovered).toBe(true);
  });

  it('detects unhover state on mouseleave', () => {
    const { result } = renderHook(() => useHover());
    const div = document.createElement('div');
    Object.defineProperty(result.current.ref, 'current', { value: div, writable: true });
    act(() => { div.dispatchEvent(new Event('mouseenter')); });
    act(() => { div.dispatchEvent(new Event('mouseleave')); });
    expect(result.current.isHovered).toBe(false);
  });
});

describe('useHoverCallback', () => {
  it('calls onHoverStart on mouseenter', () => {
    const onStart = jest.fn();
    const { result } = renderHook(() => useHoverCallback(onStart));
    const div = document.createElement('div');
    Object.defineProperty(result.current.ref, 'current', { value: div, writable: true });
    act(() => { div.dispatchEvent(new Event('mouseenter')); });
    expect(onStart).toHaveBeenCalled();
  });

  it('calls onHoverEnd on mouseleave', () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() => useHoverCallback(undefined, onEnd));
    const div = document.createElement('div');
    Object.defineProperty(result.current.ref, 'current', { value: div, writable: true });
    act(() => { div.dispatchEvent(new Event('mouseleave')); });
    expect(onEnd).toHaveBeenCalled();
  });

  it('no errors without callbacks', () => {
    const { result } = renderHook(() => useHoverCallback());
    const div = document.createElement('div');
    Object.defineProperty(result.current.ref, 'current', { value: div, writable: true });
    expect(() => {
      act(() => { div.dispatchEvent(new Event('mouseenter')); });
      act(() => { div.dispatchEvent(new Event('mouseleave')); });
    }).not.toThrow();
  });
});