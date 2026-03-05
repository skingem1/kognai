import {formatDate, isToday, addDays, diffDays, startOfDay, endOfDay, isValidDate} from '../date-utils';

describe('date-utils', () => {
  describe('formatDate', () => {
    it('handles default format, custom format, and zero padding', () => {
      expect(formatDate(new Date(2025, 0, 15))).toBe('2025-01-15');
      expect(formatDate(new Date(2025, 0, 15, 14, 30, 45), 'YYYY/MM/DD HH:mm:ss')).toBe('2025/01/15 14:30:45');
      expect(formatDate(new Date(2025, 2, 5))).toBe('2025-03-05');
    });
  });

  describe('isToday', () => {
    it('correctly identifies today vs other dates', () => {
      expect(isToday(new Date())).toBe(true);
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      expect(isToday(yesterday)).toBe(false);
    });
  });

  describe('addDays', () => {
    it('adds/subtracts days without mutation', () => {
      expect(addDays(new Date(2025, 0, 1), 10).getDate()).toBe(11);
      expect(addDays(new Date(2025, 0, 15), -5).getDate()).toBe(10);
      const orig = new Date(2025, 0, 1); addDays(orig, 5);
      expect(orig.getDate()).toBe(1);
    });
  });

  describe('diffDays', () => {
    it('calculates day differences correctly', () => {
      expect(diffDays(new Date(2025, 0, 1), new Date(2025, 0, 1))).toBe(0);
      expect(diffDays(new Date(2025, 0, 1), new Date(2025, 0, 11))).toBe(10);
      expect(diffDays(new Date(2025, 0, 11), new Date(2025, 0, 1))).toBe(10);
    });
  });

  describe('startOfDay', () => {
    it('zeroes time components', () => {
      const d = startOfDay(new Date(2025, 0, 15, 14, 30));
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    });
  });

  describe('endOfDay', () => {
    it('sets maximum time components', () => {
      const d = endOfDay(new Date(2025, 0, 15));
      expect(d.getHours()).toBe(23);
      expect(d.getMinutes()).toBe(59);
    });
  });

  describe('isValidDate', () => {
    it('validates dates correctly', () => {
      expect(isValidDate(new Date())).toBe(true);
      expect(isValidDate(new Date('invalid'))).toBe(false);
      expect(isValidDate('2025-01-01' as any)).toBe(false);
    });
  });
});