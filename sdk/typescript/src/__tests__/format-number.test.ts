import { formatNumber, formatCurrency, formatPercent, abbreviateNumber } from '../format-number';

describe('format-number', () => {
  it('formatNumber formats with commas', () => expect(formatNumber(1234567)).toBe('1,234,567'));
  it('formatNumber handles zero', () => expect(formatNumber(0)).toBe('0'));
  it('formatNumber handles negative', () => expect(formatNumber(-1234)).toBe('-1,234'));
  it('formatCurrency formats as USD', () => expect(formatCurrency(1234.5)).toBe('$1,234.50'));
  it('formatCurrency handles zero', () => expect(formatCurrency(0)).toBe('$0.00'));
  it('formatPercent formats integer', () => expect(formatPercent(75)).toBe('75%'));
  it('formatPercent formats with decimals', () => expect(formatPercent(75.5, 1)).toBe('75.5%'));
  it('abbreviateNumber formats thousands', () => expect(abbreviateNumber(1500)).toBe('1.5K'));
  it('abbreviateNumber formats millions', () => expect(abbreviateNumber(2500000)).toBe('2.5M'));
  it('abbreviateNumber formats billions', () => expect(abbreviateNumber(1000000000)).toBe('1B'));
  it('abbreviateNumber returns small numbers as-is', () => expect(abbreviateNumber(999)).toBe('999'));
  it('abbreviateNumber removes trailing .0', () => expect(abbreviateNumber(1000)).toBe('1K'));
});