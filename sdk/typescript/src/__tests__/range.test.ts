import { range, inRange, clamp } from '../range';

describe('range', () => {
  it('generates ascending sequence', () => expect(range(0, 5)).toEqual([0, 1, 2, 3, 4]));
  it('generates descending sequence', () => expect(range(5, 0)).toEqual([5, 4, 3, 2, 1]));
  it('generates with positive step', () => expect(range(0, 10, 2)).toEqual([0, 2, 4, 6, 8]));
  it('generates with negative step', () => expect(range(10, 0, -3)).toEqual([10, 7, 4, 1]));
  it('returns empty when start equals end', () => expect(range(5, 5)).toEqual([]));
  it('throws when step is zero', () => expect(() => range(0, 3, 0)).toThrow('Step cannot be zero'));
});

describe('inRange', () => {
  it('returns true for value in range', () => expect(inRange(5, 1, 10)).toBe(true));
  it('returns false for value below min', () => expect(inRange(0, 1, 10)).toBe(false));
  it('returns true for min boundary', () => expect(inRange(1, 1, 10)).toBe(true));
  it('returns true for max boundary', () => expect(inRange(10, 1, 10)).toBe(true));
});

describe('clamp', () => {
  it('clamps value above max', () => expect(clamp(15, 0, 10)).toBe(10));
  it('clamps value below min', () => expect(clamp(-5, 0, 10)).toBe(0));
  it('returns value within range', () => expect(clamp(5, 0, 10)).toBe(5));
});