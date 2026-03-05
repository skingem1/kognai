import { formatCurrency, parseCurrency, SUPPORTED_CURRENCIES } from '../../src/utils/currency';

describe('currency utils', () => {
  describe('SUPPORTED_CURRENCIES', () => {
    it('should contain USD, EUR, GBP', () => {
      expect(SUPPORTED_CURRENCIES).toContain('USD');
      expect(SUPPORTED_CURRENCIES).toContain('EUR');
      expect(SUPPORTED_CURRENCIES).toContain('GBP');
    });

    it('should be a readonly array', () => {
      // @ts-expect-error - testing readonly constraint
      expect(() => { SUPPORTED_CURRENCIES.push('JPY'); }).toThrow();
    });
  });

  describe('formatCurrency', () => {
    it('should format USD with $ symbol', () => {
      expect(formatCurrency(1234.56, 'USD')).toBe('$1234.56');
    });

    it('should format EUR with € symbol', () => {
      expect(formatCurrency(1234.56, 'EUR')).toBe('€1234.56');
    });

    it('should format GBP with £ symbol', () => {
      expect(formatCurrency(1234.56, 'GBP')).toBe('£1234.56');
    });

    it('should handle lowercase currency codes', () => {
      expect(formatCurrency(100.00, 'usd')).toBe('$100.00');
      expect(formatCurrency(100.00, 'eur')).toBe('€100.00');
      expect(formatCurrency(100.00, 'gbp')).toBe('£100.00');
    });

    it('should default to currency code for unsupported currencies', () => {
      expect(formatCurrency(1234.56, 'JPY')).toBe('JPY 1234.56');
      expect(formatCurrency(1234.56, 'CAD')).toBe('CAD 1234.56');
    });

    it('should round to 2 decimal places', () => {
      expect(formatCurrency(100.999, 'USD')).toBe('$101.00');
      expect(formatCurrency(100.1, 'USD')).toBe('$100.10');
      expect(formatCurrency(100, 'USD')).toBe('$100.00');
    });

    it('should handle negative amounts', () => {
      expect(formatCurrency(-50.00, 'USD')).toBe('$-50.00');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0, 'USD')).toBe('$0.00');
    });
  });

  describe('parseCurrency', () => {
    it('should parse USD formatted string', () => {
      expect(parseCurrency('$1234.56')).toBe(1234.56);
    });

    it('should parse EUR formatted string', () => {
      expect(parseCurrency('€1234.56')).toBe(1234.56);
    });

    it('should parse GBP formatted string', () => {
      expect(parseCurrency('£1234.56')).toBe(1234.56);
    });

    it('should parse currency code prefixed string', () => {
      expect(parseCurrency('JPY 1234.56')).toBe(1234.56);
    });

    it('should handle strings with commas', () => {
      expect(parseCurrency('$1,234.56')).toBe(1234.56);
    });

    it('should handle strings with spaces', () => {
      expect(parseCurrency('USD 1234.56')).toBe(1234.56);
    });

    it('should return 0 for invalid input', () => {
      expect(parseCurrency('')).toBe(0);
      expect(parseCurrency('abc')).toBe(0);
      expect(parseCurrency('---')).toBe(0);
    });

    it('should handle negative values in string', () => {
      expect(parseCurrency('$-50.00')).toBe(-50);
    });
  });

  describe('integration: format and parse roundtrip', () => {
    it('should roundtrip USD correctly', () => {
      const original = 1234.56;
      const formatted = formatCurrency(original, 'USD');
      const parsed = parseCurrency(formatted);
      expect(parsed).toBe(original);
    });

    it('should roundtrip EUR correctly', () => {
      const original = 999.99;
      const formatted = formatCurrency(original, 'EUR');
      const parsed = parseCurrency(formatted);
      expect(parsed).toBe(original);
    });

    it('should roundtrip unsupported currency correctly', () => {
      const original = 500.00;
      const formatted = formatCurrency(original, 'CAD');
      const parsed = parseCurrency(formatted);
      expect(parsed).toBe(original);
    });
  });
});