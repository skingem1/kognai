import { pick, omit, isEmpty, isEqual, flatten } from '../object-utils';

describe('pick', () => {
  it('picks specified keys from object', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });
  it('picks single key', () => {
    expect(pick({ a: 1, b: 2 }, ['a'])).toEqual({ a: 1 });
  });
  it('returns empty when key does not exist', () => {
    expect(pick({ a: 1 }, ['b' as any])).toEqual({});
  });
  it('returns empty object for empty keys array', () => {
    expect(pick({}, [])).toEqual({});
  });
});

describe('omit', () => {
  it('omits specified key', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 });
  });
  it('omits multiple keys', () => {
    expect(omit({ a: 1, b: 2 }, ['a', 'b'])).toEqual({});
  });
  it('returns empty object when omitting from empty', () => {
    expect(omit({}, ['a' as any])).toEqual({});
  });
  it('returns original when no keys to omit', () => {
    expect(omit({ a: 1 }, [])).toEqual({ a: 1 });
  });
});

describe('isEmpty', () => {
  it('returns true for empty object', () => {
    expect(isEmpty({})).toBe(true);
  });
  it('returns false for non-empty object', () => {
    expect(isEmpty({ a: 1 })).toBe(false);
  });
  it('returns false for object with undefined value', () => {
    expect(isEmpty({ a: undefined })).toBe(false);
  });
});

describe('isEqual', () => {
  it('compares equal objects', () => {
    expect(isEqual({ a: 1 }, { a: 1 })).toBe(true);
  });
  it('returns false for different values', () => {
    expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
  });
  it('compares equal arrays', () => {
    expect(isEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });
  it('returns false for different arrays', () => {
    expect(isEqual([1, 2], [1, 3])).toBe(false);
  });
  it('compares equal strings', () => {
    expect(isEqual('hello', 'hello')).toBe(true);
  });
  it('compares equal primitives', () => {
    expect(isEqual(1, 1)).toBe(true);
  });
  it('compares null', () => {
    expect(isEqual(null, null)).toBe(true);
  });
  it('returns false for objects with different keys', () => {
    expect(isEqual({ a: 1 }, { b: 1 })).toBe(false);
  });
});

describe('flatten', () => {
  it('flattens nested object', () => {
    expect(flatten({ a: { b: 1 } })).toEqual({ 'a.b': 1 });
  });
  it('flattens deeply nested object', () => {
    expect(flatten({ a: { b: { c: 2 } } })).toEqual({ 'a.b.c': 2 });
  });
  it('returns same object if already flat', () => {
    expect(flatten({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
  });
  it('returns empty object for empty input', () => {
    expect(flatten({})).toEqual({});
  });
  it('flattens mixed nested and flat', () => {
    expect(flatten({ a: { b: 1 }, c: 3 })).toEqual({ 'a.b': 1, c: 3 });
  });
});