import { sum, average, median, roundTo, lerp, percentage } from '../math-utils';

describe('math-utils', () => {
  it('sum([1,2,3]) => 6', () => expect(sum([1,2,3])).toBe(6));
  it('sum([]) => 0', () => expect(sum([])).toBe(0));
  it('average([2,4,6]) => 4', () => expect(average([2,4,6])).toBe(4));
  it('average([]) => 0', () => expect(average([])).toBe(0));
  it('median([1,2,3]) => 2', () => expect(median([1,2,3])).toBe(2));
  it('median([1,2,3,4]) => 2.5', () => expect(median([1,2,3,4])).toBe(2.5));
  it('median([]) => 0', () => expect(median([])).toBe(0));
  it('roundTo(3.14159, 2) => 3.14', () => expect(roundTo(3.14159, 2)).toBe(3.14));
  it('roundTo(3.145, 2) => 3.15', () => expect(roundTo(3.145, 2)).toBe(3.15));
  it('lerp(0, 10, 0.5) => 5', () => expect(lerp(0, 10, 0.5)).toBe(5));
  it('lerp(0, 10, 0) => 0', () => expect(lerp(0, 10, 0)).toBe(0));
  it('lerp(0, 10, 1) => 10', () => expect(lerp(0, 10, 1)).toBe(10));
  it('percentage(25, 100) => 25', () => expect(percentage(25, 100)).toBe(25));
  it('percentage(1, 3) to be close to 33.33', () => expect(percentage(1, 3)).toBeCloseTo(33.33, 1));
  it('percentage(5, 0) => 0', () => expect(percentage(5, 0)).toBe(0));
});