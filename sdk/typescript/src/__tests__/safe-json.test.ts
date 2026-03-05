import {safeParse, safeStringify, parseOrThrow, isValidJson, deepClone, prettyPrint} from '../safe-json';

describe('safe-json', () => {
  describe('safeParse', () => {
    it('parses valid JSON', () => expect(safeParse('{"a":1}')).toEqual({a:1}));
    it('returns undefined on invalid', () => expect(safeParse('not json')).toBeUndefined());
    it('returns fallback on invalid', () => expect(safeParse('bad', {default:true})).toEqual({default:true}));
    it('parses arrays', () => expect(safeParse('[1,2,3]')).toEqual([1,2,3]));
  });

  describe('safeStringify', () => {
    it('stringifies object', () => expect(safeStringify({a:1})).toBe('{"a":1}'));
    it('returns undefined on circular', () => { const obj: any = {}; obj.self = obj; expect(safeStringify(obj)).toBeUndefined(); });
    it('respects indent', () => expect(safeStringify({a:1}, 2)).toContain('\n'));
  });

  describe('parseOrThrow', () => {
    it('parses valid', () => expect(parseOrThrow('{"x":1}')).toEqual({x:1}));
    it('throws on invalid', () => expect(() => parseOrThrow('bad')).toThrow('Invalid JSON'));
    it('uses custom error', () => expect(() => parseOrThrow('bad', 'Custom')).toThrow('Custom'));
  });

  describe('isValidJson', () => {
    it('true for valid', () => expect(isValidJson('{"a":1}')).toBe(true));
    it('false for invalid', () => expect(isValidJson('not json')).toBe(false));
    it('true for primitives', () => expect(isValidJson('"hello"')).toBe(true));
  });

  describe('deepClone', () => {
    it('clones object', () => { const orig = {a:1,b:{c:2}}; const clone = deepClone(orig); clone.b.c = 99; expect(orig.b.c).toBe(2); });
    it('clones array', () => { const arr = [1,[2,3]]; const clone = deepClone(arr); clone[1][0] = 99; expect(arr[1][0]).toBe(2); });
  });

  describe('prettyPrint', () => {
    it('formats object', () => expect(prettyPrint({a:1})).toContain('\n'));
  });
});