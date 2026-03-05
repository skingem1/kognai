import { safeGetItem, safeSetItem, safeRemoveItem, getJSON, setJSON, clearStorage, getStorageKeys } from '../storage-utils';

describe('storage-utils', () => {
  let store: Record<string, string>;
  let mockStorage: Storage;

  beforeEach(() => {
    store = {};
    mockStorage = {
      getItem: jest.fn((k: string) => store[k] || null),
      setItem: jest.fn((k: string, v: string) => { store[k] = v; }),
      removeItem: jest.fn((k: string) => { delete store[k]; }),
      clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
      get length() { return Object.keys(store).length; },
      key: jest.fn((i: number) => Object.keys(store)[i] || null),
    };
    Object.defineProperty(window, 'localStorage', { value: mockStorage, writable: true });
  });

  it('safeSetItem and safeGetItem work correctly', () => {
    expect(safeSetItem('k', 'v')).toBe(true);
    expect(safeGetItem('k')).toBe('v');
  });

  it('safeGetItem returns null for missing key', () => {
    expect(safeGetItem('missing')).toBeNull();
  });

  it('safeRemoveItem removes and returns true', () => {
    safeSetItem('k', 'v');
    expect(safeRemoveItem('k')).toBe(true);
    expect(safeGetItem('k')).toBeNull();
  });

  it('getJSON and setJSON handle roundtrip and defaults', () => {
    setJSON('obj', { a: 1 });
    expect(getJSON('obj', {})).toEqual({ a: 1 });
    expect(getJSON('missing', 'default')).toBe('default');
    store['bad'] = 'not json';
    expect(getJSON('bad', [])).toEqual([]);
  });

  it('clearStorage clears all items', () => {
    safeSetItem('a', '1');
    safeSetItem('b', '2');
    clearStorage();
    expect(mockStorage.clear).toHaveBeenCalled();
  });

  it('getStorageKeys returns all keys', () => {
    store['x'] = '1';
    store['y'] = '2';
    expect(getStorageKeys().sort()).toEqual(['x', 'y']);
  });

  it('handles storage errors gracefully', () => {
    mockStorage.getItem = jest.fn(() => { throw new Error('denied'); });
    expect(safeGetItem('k')).toBeNull();
  });
});