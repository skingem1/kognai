import { getItem, setItem, removeItem, clearAll, getAllKeys } from '../local-storage';

describe('local-storage', () => {
  let store: Record<string, string>;
  let mockStorage: jest.Mocked<Storage>;

  beforeEach(() => {
    store = {};
    mockStorage = {
      getItem: jest.fn((k: string) => store[k] ?? null),
      setItem: jest.fn((k: string, v: string) => { store[k] = v; }),
      removeItem: jest.fn((k: string) => { delete store[k]; }),
      clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
      get length() { return Object.keys(store).length; },
      key: jest.fn((i: number) => Object.keys(store)[i] ?? null)
    } as unknown as jest.Mocked<Storage>;
    Object.defineProperty(window, 'localStorage', { value: mockStorage });
  });

  it('getItem returns parsed value', () => {
    store['k'] = '{"a":1}';
    expect(getItem('k', null)).toEqual({ a: 1 });
  });

  it('getItem returns fallback for missing key', () => {
    expect(getItem('missing', 'default')).toBe('default');
  });

  it('setItem stores JSON value', () => {
    expect(setItem('k', { a: 1 })).toBe(true);
    expect(store['k']).toBe('{"a":1}');
  });

  it('setItem returns false on error', () => {
    mockStorage.setItem.mockImplementationOnce(() => { throw new Error(); });
    expect(setItem('k', 'v')).toBe(false);
  });

  it('removeItem removes key', () => {
    store['k'] = 'v';
    expect(removeItem('k')).toBe(true);
    expect(store['k']).toBeUndefined();
  });

  it('clearAll clears all', () => {
    store['a'] = '1';
    store['b'] = '2';
    expect(clearAll()).toBe(true);
  });

  it('getAllKeys returns keys', () => {
    store['x'] = '1';
    store['y'] = '2';
    expect(getAllKeys()).toEqual(['x', 'y']);
  });
});