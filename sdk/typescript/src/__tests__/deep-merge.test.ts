import {isPlainObject, deepMerge, deepClone, deepEqual, pick, omit} from '../deep-merge';

describe('isPlainObject', () => {
  it('returns true for plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({a:1})).toBe(true);
  });
  it('returns false for non-plain values', () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
  });
});

describe('deepMerge', () => {
  it('merges shallow and deep', () => {
    expect(deepMerge({a:1}, {b:2})).toEqual({a:1,b:2});
    expect(deepMerge({a:{x:1}}, {a:{y:2}})).toEqual({a:{x:1,y:2}});
  });
  it('handles overrides and null/undefined', () => {
    expect(deepMerge({a:1}, {a:2})).toEqual({a:2});
    expect(deepMerge({a:[1,2]}, {a:[3]})).toEqual({a:[3]});
    expect(deepMerge({a:1}, {a:undefined})).toEqual({a:1});
    expect(deepMerge({a:1}, {a:null})).toEqual({a:null});
  });
  it('merges multiple sources without mutation', () => {
    expect(deepMerge({a:1}, {b:2}, {c:3})).toEqual({a:1,b:2,c:3});
    const src = {a:1};
    deepMerge(src, {b:2});
    expect(src).toEqual({a:1});
  });
});

describe('deepClone', () => {
  it('clones objects and arrays deeply', () => {
    const o = {a:{b:1}};
    const c = deepClone(o);
    c.a.b = 2;
    expect(o.a.b).toBe(1);
  });
  it('clones arrays and primitives', () => {
    const a = [1,[2]];
    const c = deepClone(a);
    c[1][0] = 3;
    expect(a[1][0]).toBe(2);
    expect(deepClone(42)).toBe(42);
  });
});

describe('deepEqual', () => {
  it('compares objects deeply', () => {
    expect(deepEqual({a:1,b:{c:2}}, {a:1,b:{c:2}})).toBe(true);
    expect(deepEqual({a:1}, {a:2})).toBe(false);
    expect(deepEqual(NaN, NaN)).toBe(true);
  });
  it('compares arrays', () => {
    expect(deepEqual([1,2], [1,2])).toBe(true);
    expect(deepEqual([1,2], [1,3])).toBe(false);
  });
});

describe('pick/omit', () => {
  it('picks and omits keys', () => {
    expect(pick({a:1,b:2,c:3}, ['a','c'])).toEqual({a:1,c:3});
    expect(omit({a:1,b:2,c:3}, ['b'])).toEqual({a:1,c:3});
  });
});