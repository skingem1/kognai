import { pick, omit, mapValues, filterEntries, isEmpty, flatten } from '../object-utils';

describe('pick', () => {
  it('picks specified keys', () => expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 }));
  it('ignores missing keys', () => expect(pick({ a: 1 }, ['a', 'b'] as any)).toEqual({ a: 1 }));
  it('returns empty object for empty keys', () => expect(pick({ a: 1 }, [])).toEqual({}));
});

describe('omit', () => {
  it('omits specified keys', () => expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 }));
  it('returns original for empty keys', () => expect(omit({ a: 1 }, [])).toEqual({ a: 1 }));
});

describe('mapValues', () => {
  it('transforms values', () => expect(mapValues({ a: 1, b: 2 }, (v) => (v as number) * 2)).toEqual({ a: 2, b: 4 }));
  it('handles empty object', () => expect(mapValues({}, (v) => v)).toEqual({}));
});

describe('filterEntries', () => {
  it('filters by value', () => expect(filterEntries({ a: 1, b: 2, c: 3 }, (_k, v) => (v as number) > 1)).toEqual({ b: 2, c: 3 }));
  it('filters by key', () => expect(filterEntries({ name: 'x', age: 1 }, (k) => k === 'name')).toEqual({ name: 'x' }));
});

describe('isEmpty', () => {
  it('returns true for null/undefined/empty', () => { expect(isEmpty(null)).toBe(true); expect(isEmpty(undefined)).toBe(true); expect(isEmpty('')).toBe(true); expect(isEmpty('  ')).toBe(true); expect(isEmpty([])).toBe(true); expect(isEmpty({})).toBe(true); });
  it('returns false for non-empty', () => { expect(isEmpty('hi')).toBe(false); expect(isEmpty([1])).toBe(false); expect(isEmpty({ a: 1 })).toBe(false); });
});

describe('flatten', () => {
  it('flattens nested objects', () => { expect(flatten({ a: { b: 1 } })).toEqual({ 'a.b': 1 }); expect(flatten({ a: { b: { c: 1 } } })).toEqual({ 'a.b.c': 1 }); });
  it('handles mixed and preserves arrays', () => { expect(flatten({ a: 1, b: { c: 2 } })).toEqual({ a: 1, 'b.c': 2 }); expect(flatten({ a: [1, 2] })).toEqual({ a: [1, 2] }); });
});