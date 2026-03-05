import {clamp, lerp, roundTo, percentage, average, median, sum} from '../math-utils';

describe('math-utils', () => {
  describe('clamp', () => {
    it('returns value when in range', () => expect(clamp(5, 0, 10)).toBe(5));
    it('returns min when below', () => expect(clamp(-5, 0, 10)).toBe(0));
    it('returns max when above', () => expect(clamp(15, 0, 10)).toBe(10));
    it('handles min > max by swapping', () => expect(clamp(5, 10, 0)).toBe(5));
  });

  describe('lerp', () => {
    it('t=0 returns start, t=1 returns end', () => {
      expect(lerp(0, 100, 0)).toBe(0);
      expect(lerp(0, 100, 1)).toBe(100);
    });
    it('t=0.5 returns midpoint', () => expect(lerp(0, 100, 0.5)).toBe(50));
    it('allows extrapolation', () => expect(lerp(0, 100, 1.5)).toBe(150));
  });

  describe('roundTo', () => {
    it('rounds to specified decimals', () => expect(roundTo(3.14159, 2)).toBe(3.14));
    it('rounds to 0 decimals', () => expect(roundTo(3.7, 0)).toBe(4));
    it('handles negative decimals as 0', () => expect(roundTo(3.7, -1)).toBe(4));
    it('defaults to 2 decimals', () => expect(roundTo(3.14159)).toBe(3.14));
  });

  describe('percentage', () => {
    it('calculates basic percentage', () => expect(percentage(25, 100)).toBe(25));
    it('returns 0 when total is 0', () => expect(percentage(10, 0)).toBe(0));
    it('handles fractions', () => expect(percentage(1, 3)).toBeCloseTo(33.333, 2));
  });

  describe('average', () => {
    it('calculates mean', () => expect(average([10, 20, 30])).toBe(20));
    it('returns 0 for empty array', () => expect(average([])).toBe(0));
  });

  describe('median', () => {
    it('handles odd length', () => expect(median([1, 3, 5])).toBe(3));
    it('handles even length', () => expect(median([1, 2, 3, 4])).toBe(2.5));
    it('returns 0 for empty array', () => expect(median([])).toBe(0));
    it('does not mutate input', () => {
      const arr = [3, 1, 2];
      median(arr);
      expect(arr).toEqual([3, 1, 2]);
    });
  });

  describe('sum', () => {
    it('sums values', () => expect(sum([1, 2, 3, 4])).toBe(10));
    it('returns 0 for empty array', () => expect(sum([])).toBe(0));
  });
});