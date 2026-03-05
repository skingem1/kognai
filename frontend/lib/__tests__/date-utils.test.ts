import { isToday, isPast, daysBetween, toISODate, formatTime, isValidDate } from '../date-utils';

describe('date-utils', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-18T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isToday', () => {
    it('returns true for same day', () => expect(isToday('2026-02-18T10:00:00Z')).toBe(true));
    it('returns false for yesterday', () => expect(isToday('2026-02-17T10:00:00Z')).toBe(false));
    it('returns false for tomorrow', () => expect(isToday('2026-02-19T10:00:00Z')).toBe(false));
  });

  describe('isPast', () => {
    it('returns true for past date', () => expect(isPast('2020-01-01')).toBe(true));
    it('returns false for future date', () => expect(isPast('2030-01-01')).toBe(false));
    it('returns true for 1 hour before mocked time', () => expect(isPast('2026-02-18T11:00:00Z')).toBe(true));
  });

  describe('daysBetween', () => {
    it('returns 9 days between Jan 1 and Jan 10', () => expect(daysBetween('2026-01-01', '2026-01-10')).toBe(9));
    it('returns absolute value for reversed dates', () => expect(daysBetween('2026-01-10', '2026-01-01')).toBe(9));
    it('returns 0 for same date', () => expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0));
  });

  describe('toISODate', () => {
    it('converts datetime to ISO date', () => expect(toISODate('2026-02-18T14:30:00Z')).toBe('2026-02-18'));
    it('handles end of year', () => expect(toISODate('2024-12-25T00:00:00Z')).toBe('2024-12-25'));
  });

  describe('formatTime', () => {
    it('produces string with AM or PM', () => expect(formatTime('2026-02-18T10:00:00Z')).toMatch(/AM|PM/));
    it('contains time and period for afternoon', () => {
      const result = formatTime('2026-02-18T14:30:00Z');
      expect(result).toContain('2:30');
      expect(result).toContain('PM');
    });
  });

  describe('isValidDate', () => {
    it('returns true for valid date', () => expect(isValidDate('2026-02-18')).toBe(true));
    it('returns true for valid datetime', () => expect(isValidDate('2026-02-18T14:30:00Z')).toBe(true));
    it('returns false for invalid string', () => expect(isValidDate('not-a-date')).toBe(false));
    it('returns false for empty string', () => expect(isValidDate('')).toBe(false));
  });
});