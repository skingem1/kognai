import { formatCurrency, formatDate, formatRelativeTime, truncateText, formatNumber } from '../format-utils';

describe('format-utils', () => {
  describe('formatCurrency', () => {
    it('formats USD by default', () => expect(formatCurrency(1234.56)).toBe('$1,234.56'));
    it('formats EUR', () => expect(formatCurrency(1234.56, 'EUR')).toBe('€1,234.56'));
    it('formats zero', () => expect(formatCurrency(0)).toBe('$0.00'));
    it('formats negative', () => expect(formatCurrency(-500)).toBe('-$500.00'));
    it('formats large number', () => expect(formatCurrency(1000000)).toBe('$1,000,000.00'));
  });

  describe('formatDate', () => {
    it('formats ISO date', () => expect(formatDate('2024-01-15')).toBe('Jan 15, 2024'));
    it('formats another date', () => expect(formatDate('2023-06-01')).toBe('Jun 1, 2023'));
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    it('shows just now', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      jest.setSystemTime(date);
      expect(formatRelativeTime(date.toISOString())).toBe('just now');
    });
    it('shows 1 minute ago', () => {
      jest.setSystemTime(new Date('2024-01-01T00:01:00Z'));
      expect(formatRelativeTime('2024-01-01T00:00:00Z')).toBe('1 minute ago');
    });
    it('shows 5 minutes ago', () => {
      jest.setSystemTime(new Date('2024-01-01T00:05:00Z'));
      expect(formatRelativeTime('2024-01-01T00:00:00Z')).toBe('5 minutes ago');
    });
    it('shows 1 hour ago', () => {
      jest.setSystemTime(new Date('2024-01-01T01:00:00Z'));
      expect(formatRelativeTime('2024-01-01T00:00:00Z')).toBe('1 hour ago');
    });
    it('shows 3 hours ago', () => {
      jest.setSystemTime(new Date('2024-01-01T03:00:00Z'));
      expect(formatRelativeTime('2024-01-01T00:00:00Z')).toBe('3 hours ago');
    });
    it('shows 1 day ago', () => {
      jest.setSystemTime(new Date('2024-01-02T00:00:00Z'));
      expect(formatRelativeTime('2024-01-01T00:00:00Z')).toBe('1 day ago');
    });
    it('shows 15 days ago', () => {
      jest.setSystemTime(new Date('2024-01-16T00:00:00Z'));
      expect(formatRelativeTime('2024-01-01T00:00:00Z')).toBe('15 days ago');
    });
    it('falls back to formatDate for 31 days', () => {
      jest.setSystemTime(new Date('2024-02-01T00:00:00Z'));
      expect(formatRelativeTime('2024-01-01T00:00:00Z')).toBe('Jan 1, 2024');
    });
  });

  describe('truncateText', () => {
    it('leaves short text unchanged', () => expect(truncateText('Hello')).toBe('Hello'));
    it('handles exact maxLength', () => expect(truncateText('12345678901234567890123456789012345678901234567890', 50)).toBe('12345678901234567890123456789012345678901234567890'));
    it('truncates long text', () => expect(truncateText('This is a very long string that should be truncated')).toBe('This is a very long string that should be truncat...'));
    it('respects custom maxLength', () => expect(truncateText('Hello World', 5)).toBe('Hello...'));
  });

  describe('formatNumber', () => {
    it('formats small number', () => expect(formatNumber(42)).toBe('42'));
    it('formats large number', () => expect(formatNumber(1000)).toBe('1,000'));
    it('formats zero', () => expect(formatNumber(0)).toBe('0'));
  });
});