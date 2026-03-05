import { MemoryCache, createCache } from '../cache';

describe('MemoryCache', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('constructor sets default TTL to 60000ms', () => {
    const cache = new MemoryCache();
    expect((cache as any).defaultTtlMs).toBe(60000);
  });

  it('set and get work correctly', () => {
    const cache = new MemoryCache();
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('get returns undefined for missing key', () => {
    const cache = new MemoryCache();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('has returns true for existing non-expired key', () => {
    const cache = new MemoryCache();
    cache.set('key', 'value');
    expect(cache.has('key')).toBe(true);
  });

  it('has returns false for missing key', () => {
    const cache = new MemoryCache();
    expect(cache.has('missing')).toBe(false);
  });

  it('delete removes entry and returns true', () => {
    const cache = new MemoryCache();
    cache.set('key', 'value');
    expect(cache.delete('key')).toBe(true);
    expect(cache.get('key')).toBeUndefined();
  });

  it('delete returns false for missing key', () => {
    const cache = new MemoryCache();
    expect(cache.delete('missing')).toBe(false);
  });

  it('clear removes all entries', () => {
    const cache = new MemoryCache();
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('size returns count of entries', () => {
    const cache = new MemoryCache();
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.size()).toBe(2);
  });

  it('keys returns array of keys', () => {
    const cache = new MemoryCache();
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.keys()).toEqual(['a', 'b']);
  });

  it('get returns undefined for expired entry', () => {
    const cache = new MemoryCache();
    cache.set('key', 'value', 1000);
    jest.advanceTimersByTime(1001);
    expect(cache.get('key')).toBeUndefined();
  });

  it('has returns false for expired entry', () => {
    const cache = new MemoryCache();
    cache.set('key', 'value', 1000);
    jest.advanceTimersByTime(1001);
    expect(cache.has('key')).toBe(false);
  });

  it('size excludes expired entries', () => {
    const cache = new MemoryCache();
    cache.set('a', '1', 1000);
    cache.set('b', '2', 1000);
    jest.advanceTimersByTime(1001);
    expect(cache.size()).toBe(0);
  });

  it('keys excludes expired entries', () => {
    const cache = new MemoryCache();
    cache.set('a', '1', 1000);
    cache.set('b', '2', 2000);
    jest.advanceTimersByTime(1001);
    expect(cache.keys()).toEqual(['b']);
  });

  it('custom TTL per entry works', () => {
    const cache = new MemoryCache();
    cache.set('a', '1', 500);
    cache.set('b', '2', 2000);
    jest.advanceTimersByTime(600);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
  });

  it('default TTL is used when no custom TTL', () => {
    const cache = new MemoryCache();
    cache.set('key', 'val');
    jest.advanceTimersByTime(59999);
    expect(cache.get('key')).toBe('val');
    jest.advanceTimersByTime(2);
    expect(cache.get('key')).toBeUndefined();
  });
});

describe('createCache', () => {
  it('returns MemoryCache instance', () => {
    const cache = createCache();
    expect(cache).toBeInstanceOf(MemoryCache);
  });

  it('createCache with custom TTL passes to MemoryCache', () => {
    const cache = createCache(5000);
    expect((cache as any).defaultTtlMs).toBe(5000);
  });
});