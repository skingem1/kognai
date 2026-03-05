import { roundTo, centsToMajor, majorToCents, percentage, clamp, isApproxEqual } from '../number-utils';

describe('roundTo', () => {
  it('rounds to specified decimal places', () => expect(roundTo(3.14159, 2)).toBe(3.14));
  it('rounds up on 5', () => expect(roundTo(3.145, 2)).toBe(3.15));
  it('rounds down when digit < 5', () => expect(roundTo(3.145, 1)).toBe(3.1));
  it('handles zero decimal places', () => expect(roundTo(100, 0)).toBe(100));
  it('rounds 0.5 up to 1', () => expect(roundTo(0.5, 0)).toBe(1));
});

describe('centsToMajor', () => {
  it('converts cents to major units', () => expect(centsToMajor(1550)).toBe(15.50));
  it('handles whole dollar amount', () => expect(centsToMajor(100)).toBe(1));
  it('handles zero', () => expect(centsToMajor(0)).toBe(0));
  it('handles cents less than dollar', () => expect(centsToMajor(99)).toBe(0.99));
  it('handles single cent', () => expect(centsToMajor(1)).toBe(0.01));
});

describe('majorToCents', () => {
  it('converts major units to cents', () => expect(majorToCents(15.50)).toBe(1550));
  it('handles whole dollar', () => expect(majorToCents(1.00)).toBe(100));
  it('handles decimal less than dollar', () => expect(majorToCents(0.99)).toBe(99));
  it('handles zero', () => expect(majorToCents(0)).toBe(0));
  it('handles typical price', () => expect(majorToCents(19.99)).toBe(1999));
});

describe('percentage', () => {
  it('calculates exact percentage', () => expect(percentage(25, 100)).toBe(25));
  it('rounds to two decimals by default', () => expect(percentage(1, 3)).toBe(33.33));
  it('handles zero numerator', () => expect(percentage(0, 100)).toBe(0));
  it('returns 0 on division by zero', () => expect(percentage(50, 0)).toBe(0));
  it('respects custom decimal places', () => expect(percentage(1, 3, 0)).toBe(33));
});

describe('clamp', () => {
  it('returns value when within range', () => expect(clamp(5, 0, 10)).toBe(5));
  it('clamps value below min', () => expect(clamp(-5, 0, 10)).toBe(0));
  it('clamps value above max', () => expect(clamp(15, 0, 10)).toBe(10));
  it('handles value at min', () => expect(clamp(0, 0, 10)).toBe(0));
  it('handles value at max', () => expect(clamp(10, 0, 10)).toBe(10));
});

describe('isApproxEqual', () => {
  it('handles floating point precision', () => expect(isApproxEqual(0.1 + 0.2, 0.3)).toBe(true));
  it('matches equal values', () => expect(isApproxEqual(1.0, 1.0)).toBe(true));
  it('rejects unequal values', () => expect(isApproxEqual(1.0, 2.0)).toBe(false));
  it('accepts custom epsilon', () => expect(isApproxEqual(1.0, 1.0001, 0.001)).toBe(true));
  it('rejects with strict epsilon', () => expect(isApproxEqual(1.0, 1.01, 0.001)).toBe(false));
});