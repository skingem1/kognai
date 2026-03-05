import { invariant, assertDefined, assertString, assertNumber, unreachable } from '../invariant';

describe('invariant', () => {
  it('invariant passes for truthy', () => expect(() => invariant(true, 'fail')).not.toThrow());
  it('invariant throws for falsy', () => expect(() => invariant(false, 'must be true')).toThrow('must be true'));
  it('invariant throws for null', () => expect(() => invariant(null, 'msg')).toThrow());
  it('assertDefined returns value', () => expect(assertDefined('hello', 'val')).toBe('hello'));
  it('assertDefined throws for null', () => expect(() => assertDefined(null, 'x')).toThrow('x must be defined'));
  it('assertDefined throws for undefined', () => expect(() => assertDefined(undefined, 'x')).toThrow('x must be defined'));
  it('assertString returns string', () => expect(assertString('hi', 'val')).toBe('hi'));
  it('assertString throws for number', () => expect(() => assertString(42, 'val')).toThrow('val must be a string'));
  it('assertNumber returns number', () => expect(assertNumber(42, 'val')).toBe(42));
  it('assertNumber throws for string', () => expect(() => assertNumber('hi', 'val')).toThrow('val must be a number'));
  it('assertNumber throws for NaN', () => expect(() => assertNumber(NaN, 'val')).toThrow('val must be a number'));
  it('unreachable throws', () => expect(() => unreachable('x' as never)).toThrow('Unreachable'));
});