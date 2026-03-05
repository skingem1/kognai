import { renderHook, act } from '@testing-library/react';
import { useFocusTrap } from '../use-focus-trap';

describe('useFocusTrap', () => {
  let container: HTMLDivElement;
  let button1: HTMLButtonElement;
  let button2: HTMLButtonElement;

  beforeEach(() => {
    container = document.createElement('div');
    button1 = document.createElement('button');
    button2 = document.createElement('button');
    container.appendChild(button1);
    container.appendChild(button2);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns ref object', () => {
    const { result } = renderHook(() => useFocusTrap());
    expect(result.current).toBeDefined();
    expect(result.current.current).toBeNull();
  });

  it('ref is assignable', () => {
    const div = document.createElement('div');
    const { result } = renderHook(() => useFocusTrap());
    result.current.current = div;
    expect(result.current.current).toBe(div);
  });

  it('works with enabled false', () => {
    const { result, rerender } = renderHook(() => useFocusTrap({ enabled: false }));
    result.current.current = container;
    rerender();
    expect(result.current).toBeDefined();
    expect(document.activeElement).toBe(document.body);
  });

  it('works with autoFocus false', () => {
    const { result } = renderHook(() => useFocusTrap({ autoFocus: false }));
    expect(result.current).toBeDefined();
  });

  it('default options', () => {
    expect(() => renderHook(() => useFocusTrap())).not.toThrow();
  });

  it('traps focus on tab', () => {
    const { result, rerender } = renderHook(() => useFocusTrap({ enabled: true }));
    result.current.current = container;
    rerender();
    
    button2.focus();
    expect(document.activeElement).toBe(button2);
    
    button2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    
    expect(document.activeElement).toBe(button1);
  });

  it('traps focus on shift+tab', () => {
    const { result, rerender } = renderHook(() => useFocusTrap({ enabled: true }));
    result.current.current = container;
    rerender();
    
    button1.focus();
    expect(document.activeElement).toBe(button1);
    
    button1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    
    expect(document.activeElement).toBe(button2);
  });
});