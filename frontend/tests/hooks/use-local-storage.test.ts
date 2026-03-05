import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '../../hooks/use-local-storage';

const mockStorage: Record<string, string> = {};

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(k => mockStorage[k] || null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { mockStorage[k] = v; });
});

afterEach(() => jest.restoreAllMocks());

describe('useLocalStorage', () => {
  it('returns initialValue when key not in localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
    expect(result.current[0]).toBe('default');
  });

  it('returns stored value when key exists in localStorage', () => {
    mockStorage['existing-key'] = '"hello"';
    const { result } = renderHook(() => useLocalStorage('existing-key', 'default'));
    expect(result.current[0]).toBe('hello');
  });

  it('setValue updates the value', () => {
    const { result } = renderHook(() => useLocalStorage('update-key', 'initial'));
    act(() => result.current[1]('new'));
    expect(result.current[0]).toBe('new');
  });

  it('setValue with updater function', () => {
    const { result } = renderHook(() => useLocalStorage('counter-key', 0));
    act(() => result.current[1]((prev: number) => prev + 5));
    expect(result.current[0]).toBe(5);
  });

  it('writes to localStorage on set', () => {
    const { result } = renderHook(() => useLocalStorage('write-key', 'start'));
    act(() => result.current[1]('written'));
    expect(mockStorage['write-key']).toBe('"written"');
  });

  it('handles localStorage.getItem error gracefully', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('error'); });
    const { result } = renderHook(() => useLocalStorage('error-key', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });
});