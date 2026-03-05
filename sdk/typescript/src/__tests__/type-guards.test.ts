import {isString, isNumber, isBoolean, isObject, isArray, isNonEmpty, isNullish, hasProperty, assertDefined, isInstanceOf} from '../type-guards';

describe('type-guards', () => {
  it('isString validates string primitives', () => {
    expect(isString('hello')).toBe(true);
    expect(isString(42)).toBe(false);
  });

  it('isNumber validates number primitives excluding NaN', () => {
    expect(isNumber(42)).toBe(true);
    expect(isNumber(NaN)).toBe(false);
    expect(isNumber('42')).toBe(false);
  });

  it('isBoolean validates boolean primitives', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(1)).toBe(false);
  });

  it('isObject validates plain objects', () => {
    expect(isObject({})).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject([])).toBe(false);
  });

  it('isArray validates arrays', () => {
    expect(isArray([])).toBe(true);
    expect(isArray({})).toBe(false);
  });

  it('isNonEmpty validates non-empty strings, arrays, objects', () => {
    expect(isNonEmpty('hi')).toBe(true);
    expect(isNonEmpty('  ')).toBe(false);
    expect(isNonEmpty([1])).toBe(true);
    expect(isNonEmpty([])).toBe(false);
    expect(isNonEmpty({a:1})).toBe(true);
    expect(isNonEmpty({})).toBe(false);
  });

  it('isNullish validates null and undefined only', () => {
    expect(isNullish(null)).toBe(true);
    expect(isNullish(undefined)).toBe(true);
    expect(isNullish(false)).toBe(false);
    expect(isNullish(0)).toBe(false);
  });

  it('hasProperty checks own properties on objects', () => {
    expect(hasProperty({a:1}, 'a')).toBe(true);
    expect(hasProperty({a:1}, 'b')).toBe(false);
    expect(hasProperty(null, 'a')).toBe(false);
  });

  it('assertDefined throws for nullish values', () => {
    expect(() => assertDefined(42)).not.toThrow();
    expect(() => assertDefined(null)).toThrow();
    expect(() => assertDefined(undefined, 'myVar')).toThrow('myVar');
  });

  it('isInstanceOf checks prototype chain', () => {
    expect(isInstanceOf(new Date(), Date)).toBe(true);
    expect(isInstanceOf({}, Date)).toBe(false);
  });
});