import { percentage } from './percentage';

describe('percentage', () => {
  it('calculates basic percentage', () => {
    expect(percentage(25, 100)).toBe(25);
  });

  it('rounds to 2 decimal places by default', () => {
    expect(percentage(1, 3)).toBe(33.33);
  });

  it('returns 0 when part is 0', () => {
    expect(percentage(0, 100)).toBe(0);
  });

  it('returns 0 when total is 0 (avoids division by zero)', () => {
    expect(percentage(5, 0)).toBe(0);
  });

  it('respects custom decimal places', () => {
    expect(percentage(1, 3, 4)).toBe(33.3333);
  });
});