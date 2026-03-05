import { safeJsonParse, stableStringify, deepClone, toFormData, maskSensitiveFields } from '../serializer';

describe('safeJsonParse', () => {
  it('parses valid JSON object', () => expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 }));
  it('parses valid JSON array', () => expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]));
  it('parses valid JSON string', () => expect(safeJsonParse('"hello"')).toBe('hello'));
  it('returns null for invalid JSON', () => expect(safeJsonParse('invalid')).toBeNull());
  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('invalid', {})).toEqual({});
    expect(safeJsonParse('invalid', [])).toEqual([]);
  });
  it('returns null for empty string', () => expect(safeJsonParse('')).toBeNull());
});

describe('stableStringify', () => {
  it('stringifies object with sorted keys', () => expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}'));
  it('stringifies simple object', () => expect(stableStringify({ a: 1 })).toBe('{"a":1}'));
  it('stringifies empty object', () => expect(stableStringify({})).toBe('{}'));
  it('handles null', () => expect(stableStringify(null)).toBe('null'));
  it('handles string and number', () => {
    expect(stableStringify('hello')).toBe('"hello"');
    expect(stableStringify(42)).toBe('42');
  });
});

describe('deepClone', () => {
  it('returns equal object with different reference', () => {
    const original = { a: { b: 1 } };
    const cloned = deepClone(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });
  it('modifying clone does not affect original', () => {
    const original = { a: { b: 1 } };
    const cloned = deepClone(original);
    cloned.a.b = 2;
    expect(original.a.b).toBe(1);
  });
  it('clones arrays with different reference', () => {
    const original = [1, 2, 3];
    const cloned = deepClone(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });
});

describe('toFormData', () => {
  it('converts object to form data string', () => expect(toFormData({ name: 'test', count: '5' })).toBe('name=test&count=5'));
  it('returns empty string for empty object', () => expect(toFormData({})).toBe(''));
  it('URL encodes values', () => expect(toFormData({ key: 'hello world' })).toBe('key=hello%20world'));
  it('handles single key', () => expect(toFormData({ a: '1' })).toBe('a=1'));
});

describe('maskSensitiveFields', () => {
  it('masks specified fields', () => {
    expect(maskSensitiveFields({ apiKey: 'sk-secret', name: 'test' }, ['apiKey']))
      .toEqual({ apiKey: '***REDACTED***', name: 'test' });
  });
  it('does nothing with empty fields array', () => expect(maskSensitiveFields({ a: '1', b: '2' }, [])).toEqual({ a: '1', b: '2' }));
  it('masks multiple fields', () => {
    expect(maskSensitiveFields({ password: 'abc', token: 'xyz', name: 'ok' }, ['password', 'token']))
      .toEqual({ password: '***REDACTED***', token: '***REDACTED***', name: 'ok' });
  });
  it('handles empty object', () => expect(maskSensitiveFields({}, ['key'])).toEqual({}));
});