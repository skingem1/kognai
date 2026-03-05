import { formatCurrency, formatDate, formatRelativeTime, truncateText, formatNumber } from '../../lib/format-utils';

describe('formatCurrency', () => {
  it('formats with default USD, EUR, zero, negative, and large numbers', () => {
    expect(formatCurrency(1000)).toBe('$1,000.00');
    expect(formatCurrency(1000, 'EUR')).toBe('€1,000.00');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(-500)).toBe('-$500.00');
    expect(formatCurrency(1000000)).toBe('$1,000,000.00');
  });
});

describe('formatDate', () => {
  it('formats date strings correctly', () => {
    expect(formatDate('2026-02-15T00:00:00Z')).toBe('Feb 15, 2026');
    expect(formatDate('2025-12-01T00:00:00Z')).toBe('Dec 1, 2025');
  });
});

describe('formatRelativeTime', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns correct relative strings for various time diffs', () => {
    const base = new Date('2025-06-15T12:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(base);

    expect(formatRelativeTime('2025-06-15T12:00:00Z')).toBe('just now');
    expect(formatRelativeTime(new Date(base - 60000).toISOString())).toBe('1 minute ago');
    expect(formatRelativeTime(new Date(base - 300000).toISOString())).toBe('5 minutes ago');
    expect(formatRelativeTime(new Date(base - 3600000).toISOString())).toBe('1 hour ago');
    expect(formatRelativeTime(new Date(base - 7200000).toISOString())).toBe('2 hours ago');
    expect(formatRelativeTime(new Date(base - 86400000).toISOString())).toBe('1 day ago');
  });

  it('falls back to formatDate for >30 days', () => {
    const base = new Date('2025-06-15T12:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(base);
    const old = new Date(base - 31 * 86400000).toISOString();
    expect(formatRelativeTime(old)).toBe(formatDate(old));
  });
});

describe('truncateText', () => {
  it('handles short, exact, over-length, custom max, and empty', () => {
    expect(truncateText('hello')).toBe('hello');
    expect(truncateText('a'.repeat(50))).toBe('a'.repeat(50));
    expect(truncateText('a'.repeat(51))).toBe('a'.repeat(50) + '...');
    expect(truncateText('hello world', 5)).toBe('hello...');
    expect(truncateText('')).toBe('');
  });
});

describe('formatNumber', () => {
  it('formats numbers with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(42)).toBe('42');
  });
});