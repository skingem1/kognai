import { clamp, isApproxEqual } from './comparison';

describe('clamp', () => {
  it('returns value when within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('returns min when value is below', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('returns max when value is above', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('throws when min > max', () => {
    expect(() => clamp(5, 10, 0)).toThrow('min cannot be greater than max');
  });
});

describe('isApproxEqual', () => {
  it('returns true for equal values', () => {
    expect(isApproxEqual(0.1 + 0.2, 0.3)).toBe(true);
  });

  it('returns true when within tolerance', () => {
    expect(isApproxEqual(1.0, 1.0001, 0.001)).toBe(true);
  });

  it('returns false when outside tolerance', () => {
    expect(isApproxEqual(1.0, 1.01, 0.001)).toBe(false);
  });

  it('uses default tolerance of 0.0001', () => {
    expect(isApproxEqual(100, 100.00001)).toBe(true);
  });

  it('returns false for non-finite numbers', () => {
    expect(isApproxEqual(Infinity, Infinity)).toBe(false);
    expect(isApproxEqual(NaN, 1)).toBe(false);
  });

  it('throws for negative tolerance', () => {
    expect(() => isApproxEqual(1, 2, -0.1)).toThrow('non-negative');
  });
});