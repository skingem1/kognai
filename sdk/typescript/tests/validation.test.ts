import { validateParams } from '../src/validation';

describe('validateParams', () => {
  it('passes when all required params are provided', () => {
    expect(() => validateParams({ a: 1, b: 'test' }, ['a', 'b'])).not.toThrow();
  });

  it('throws when required param is undefined', () => {
    expect(() => validateParams({ a: 1 }, ['b'])).toThrow('Missing required parameter: b');
  });

  it('throws when required param is null', () => {
    expect(() => validateParams({ a: null }, ['a'])).toThrow('Missing required parameter: a');
  });

  it('throws on first missing param only', () => {
    expect(() => validateParams({}, ['a', 'b'])).toThrow('Missing required parameter: a');
  });
});