import { enumValues, enumKeys, isEnumValue, enumToOptions, assertEnumValue } from '../enum-utils';

enum Color { Red = 'red', Green = 'green', Blue = 'blue' }
enum Status { Active = 0, Inactive = 1, Pending = 2 }

describe('enumValues', () => {
  it('returns string enum values', () => expect(enumValues(Color)).toEqual(['red', 'green', 'blue']));
  it('returns numeric enum values', () => expect(enumValues(Status)).toEqual([0, 1, 2]));
});

describe('enumKeys', () => {
  it('returns string enum keys', () => expect(enumKeys(Color)).toEqual(['Red', 'Green', 'Blue']));
  it('returns numeric enum keys', () => expect(enumKeys(Status)).toEqual(['Active', 'Inactive', 'Pending']));
});

describe('isEnumValue', () => {
  it('returns true for valid string value', () => expect(isEnumValue(Color, 'red')).toBe(true));
  it('returns false for invalid string', () => expect(isEnumValue(Color, 'yellow')).toBe(false));
  it('returns true for valid numeric', () => expect(isEnumValue(Status, 0)).toBe(true));
  it('returns false for invalid numeric', () => expect(isEnumValue(Status, 5)).toBe(false));
  it('returns false when key used as value', () => expect(isEnumValue(Color, 'Red')).toBe(false));
});

describe('enumToOptions', () => {
  it('returns string enum options', () => expect(enumToOptions(Color)).toEqual([{ label: 'Red', value: 'red' }, { label: 'Green', value: 'green' }, { label: 'Blue', value: 'blue' }]));
  it('returns numeric enum options', () => { const opts = enumToOptions(Status); expect(opts).toHaveLength(3); expect(opts[0]).toEqual({ label: 'Active', value: 0 }); });
});

describe('assertEnumValue', () => {
  it('does not throw for valid value', () => expect(() => assertEnumValue(Color, 'red')).not.toThrow());
  it('throws for invalid value', () => expect(() => assertEnumValue(Color, 'yellow')).toThrow('yellow'));
  it('uses custom name in error', () => expect(() => assertEnumValue(Color, 'x', 'color')).toThrow('color'));
});