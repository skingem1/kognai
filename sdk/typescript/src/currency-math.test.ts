import { roundTo, centsToMajor, majorToCents } from './currency-math';

describe('currency-math', () => {
  describe('roundTo', () => {
    it('rounds to specified decimal places', () => {
      expect(roundTo(3.14159, 2)).toBe(3.14);
      expect(roundTo(3.145, 2)).toBe(3.15);
      expect(roundTo(100, 0)).toBe(100);
    });

    it('handles negative numbers', () => {
      expect(roundTo(-3.14159, 2)).toBe(-3.14);
      expect(roundTo(-3.145, 2)).toBe(-3.15);
    });

    it('handles invalid inputs gracefully', () => {
      expect(roundTo(Infinity, 2)).toBe(0);
      expect(roundTo(NaN, 2)).toBe(0);
      expect(roundTo(3.14, Infinity)).toBe(3);
      expect(roundTo(3.14, -5)).toBe(3);
    });
  });

  describe('centsToMajor', () => {
    it('converts cents to dollars', () => {
      expect(centsToMajor(1550)).toBe(15.50);
      expect(centsToMajor(100)).toBe(1.00);
      expect(centsToMajor(0)).toBe(0);
      expect(centsToMajor(99)).toBe(0.99);
    });

    it('handles invalid inputs gracefully', () => {
      expect(centsToMajor(Infinity)).toBe(0);
      expect(centsToMajor(NaN)).toBe(0);
    });
  });

  describe('majorToCents', () => {
    it('converts dollars to cents', () => {
      expect(majorToCents(15.50)).toBe(1550);
      expect(majorToCents(1.00)).toBe(100);
      expect(majorToCents(0)).toBe(0);
      expect(majorToCents(0.99)).toBe(99);
    });

    it('handles invalid inputs gracefully', () => {
      expect(majorToCents(Infinity)).toBe(0);
      expect(majorToCents(NaN)).toBe(0);
    });
  });
});