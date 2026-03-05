import { assert, assertString, assertNumber, assertObject, assertArray, assertNonEmpty, assertInRange, assertOneOf } from '../assert';

describe('assert', () => {
  it('passes on truthy', () => expect(() => assert(true)).not.toThrow());
  it('throws on falsy', () => expect(() => assert(false)).toThrow('Assertion failed'));
  it('throws with custom message', () => expect(() => assert(0, 'must be set')).toThrow('must be set'));
  it('passes on truthy values', () => { expect(() => assert(1)).not.toThrow(); expect(() => assert('str')).not.toThrow(); expect(() => assert([])).not.toThrow(); });
});

describe('assertString', () => {
  it('passes for string', () => expect(() => assertString('hello')).not.toThrow());
  it('throws for number', () => expect(() => assertString(42)).toThrow('string'));
  it('throws for null with custom name', () => expect(() => assertString(null, 'name')).toThrow('name'));
});

describe('assertNumber', () => {
  it('passes for number', () => expect(() => assertNumber(42)).not.toThrow());
  it('throws for NaN', () => expect(() => assertNumber(NaN)).toThrow());
  it('throws for string', () => expect(() => assertNumber('5')).toThrow());
});

describe('assertObject', () => {
  it('passes for object', () => expect(() => assertObject({a:1})).not.toThrow());
  it('throws for null', () => expect(() => assertObject(null)).toThrow());
  it('throws for array', () => expect(() => assertObject([1,2])).toThrow());
});

describe('assertArray', () => {
  it('passes for array', () => expect(() => assertArray([1,2])).not.toThrow());
  it('throws for object', () => expect(() => assertArray({a:1})).toThrow());
});

describe('assertNonEmpty', () => {
  it('passes for non-empty string', () => expect(() => assertNonEmpty('hello')).not.toThrow());
  it('throws for empty string', () => expect(() => assertNonEmpty('')).toThrow());
  it('throws for whitespace-only', () => expect(() => assertNonEmpty('  ')).toThrow());
  it('passes for non-empty array', () => expect(() => assertNonEmpty([1])).not.toThrow());
  it('throws for empty array', () => expect(() => assertNonEmpty([])).toThrow());
});

describe('assertInRange', () => {
  it('passes in range', () => expect(() => assertInRange(5, 1, 10)).not.toThrow());
  it('throws below range', () => expect(() => assertInRange(0, 1, 10)).toThrow());
  it('passes at boundaries', () => { expect(() => assertInRange(1, 1, 10)).not.toThrow(); expect(() => assertInRange(10, 1, 10)).not.toThrow(); });
});

describe('assertOneOf', () => {
  it('passes for valid value', () => expect(() => assertOneOf('a', ['a','b','c'])).not.toThrow());
  it('throws for invalid value', () => expect(() => assertOneOf('d', ['a','b','c'])).toThrow());
});