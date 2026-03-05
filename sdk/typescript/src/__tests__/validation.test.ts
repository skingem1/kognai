import { validateParams } from '../validation';

describe('validateParams', () => {
  it('does not throw when all required params present', () => {
    expect(() => validateParams({ a: 1, b: 'test' }, ['a', 'b'])).not.toThrow();
  });

  it('throws with correct message for undefined param', () => {
    expect(() => validateParams({ a: 1 }, ['b'])).toThrow('Missing required parameter: b');
  });

  it('throws with correct message for null param', () => {
    expect(() => validateParams({ a: null }, ['a'])).toThrow('Missing required parameter: a');
  });

  it('does not throw for empty required array', () => {
    expect(() => validateParams({}, [])).not.toThrow();
  });

  it('does not throw when extra params exist beyond required ones', () => {
    expect(() => validateParams({ a: 1, b: 2, c: 3 }, ['a', 'b'])).not.toThrow();
  });

  it('does not throw for falsy values that are not null/undefined', () => {
    expect(() => validateParams({ a: 0, b: false, c: '' }, ['a', 'b', 'c'])).not.toThrow();
  });

  it('throws for first missing param when multiple are missing', () => {
    expect(() => validateParams({ a: 1 }, ['a', 'b', 'c'])).toThrow('Missing required parameter: b');
  });
});