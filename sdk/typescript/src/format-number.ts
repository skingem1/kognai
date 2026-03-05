/**
 * Number formatting utilities for Countable SDK
 * @packageDocumentation
 */

/**
 * Format a number with locale-specific separators.
 * @param value - The number to format
 * @param locale - Locale string (default: 'en-US')
 * @returns Formatted number string with locale separators (e.g., '1,234,567')
 */
export function formatNumber(value: number, locale = 'en-US'): string {
  return value.toLocaleString(locale);
}

/**
 * Format a number as currency.
 * @param value - The number to format as currency
 * @param currency - Currency code (default: 'USD')
 * @param locale - Locale string (default: 'en-US')
 * @returns Formatted currency string (e.g., '$1,234.50')
 */
export function formatCurrency(value: number, currency = 'USD', locale = 'en-US'): string {
  return value.toLocaleString(locale, { style: 'currency', currency });
}

/**
 * Format a number as a percentage.
 * @param value - The number to format as percentage (e.g., 75.5 = 75.5%)
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted percentage string (e.g., '75.5%')
 */
export function formatPercent(value: number, decimals = 0): string {
  return (value / 100).toLocaleString('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Abbreviate large numbers with K, M, B, T suffixes.
 * @param value - The number to abbreviate
 * @returns Abbreviated number string (e.g., '1.5M', '2K', '500B')
 */
export function abbreviateNumber(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(1).replace('.0', '') + 'T';
  if (value >= 1e9) return (value / 1e9).toFixed(1).replace('.0', '') + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(1).replace('.0', '') + 'K';
  return value.toString();
}