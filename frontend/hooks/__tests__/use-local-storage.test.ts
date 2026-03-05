import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '../use-local-storage';

describe('useLocalStorage', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key: string) => store[key] || null),
        setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
        removeItem: jest.fn((key: string) => { delete store[key]; }),
        clear: jest.fn(() => { store = {}; }),
      },
      writable: true,
    });
  });

  it('returns initial value when localStorage is empty', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));
    expect(result.current[0]).toBe('initial');
  });

  it('reads existing value from localStorage', () => {
    store['test-key'] = JSON.stringify('existing');
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));
    expect(result.current[0]).toBe('existing');
  });

  it('setValue updates state', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'init'));
    act(() => { result.current[1]('new-value'); });
    expect(result.current[0]).toBe('new-value');
  });

  it('setValue writes to localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'init'));
    act(() => { result.current[1]('new-value'); });
    expect(store['key']).toBe(JSON.stringify('new-value'));
  });

  it('handles function updater', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'init'));
    act(() => { result.current[1]((prev: string) => prev + '-updated'); });
    expect(result.current[0]).toBe('init-updated');
  });

  it('handles object values', () => {
    const { result } = renderHook(() => useLocalStorage('obj', { name: 'test', count: 0 }));
    expect(result.current[0]).toEqual({ name: 'test', count: 0 });
  });

  it('handles JSON parse error gracefully', () => {
    store['key'] = 'invalid-json{';
    const { result } = renderHook(() => useLocalStorage('key', 'default'));
    expect(result.current[0]).toBe('default');
  });
});