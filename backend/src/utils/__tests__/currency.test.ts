import { formatCurrency, parseCurrency, SUPPORTED_CURRENCIES } from '../currency';

describe('currency utils', () => {
  it('SUPPORTED_CURRENCIES contains USD, EUR, GBP', () => {
    expect(SUPPORTED_CURRENCIES).toEqual(['USD', 'EUR', 'GBP']);
  });

  describe('formatCurrency', () => {
    it('formats USD correctly', () => expect(formatCurrency(1000, 'USD')).toBe('$1000.00'));
    it('formats EUR correctly', () => expect(formatCurrency(1000, 'EUR')).toBe('€1000.00'));
    it('formats GBP correctly', () => expect(formatCurrency(1000, 'GBP')).toBe('£1000.00'));
    it('formats 0 correctly', () => expect(formatCurrency(0, 'USD')).toBe('$0.00'));
    it('formats decimal correctly', () => expect(formatCurrency(99.9, 'USD')).toBe('$99.90'));
    it('falls back for unknown currency', () => expect(formatCurrency(1000, 'JPY')).toBe('JPY 1000.00'));
    it('handles case insensitivity', () => expect(formatCurrency(1000, 'usd')).toBe('$1000.00'));
  });

  describe('parseCurrency', () => {
    it('parses USD symbol', () => expect(parseCurrency('$1000.00')).toBe(1000));
    it('parses EUR symbol', () => expect(parseCurrency('€500.50')).toBe(500.5));
    it('parses GBP symbol', () => expect(parseCurrency('£99.99')).toBe(99.99));
    it('parses text currency', () => expect(parseCurrency('JPY 1000.00')).toBe(1000));
    it('returns 0 for NaN', () => expect(parseCurrency('abc')).toBe(0));
    it('returns 0 for empty string', () => expect(parseCurrency('')).toBe(0));
  });
});