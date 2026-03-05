/**
 * Supported currency codes with their symbols
 */
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP'] as const;

/**
 * Currency symbol mapping
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
};

/**
 * Formats a number as currency with the appropriate symbol
 * @param amount - The amount to format
 * @param currency - The currency code (USD, EUR, GBP)
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency: string): string {
  const formattedAmount = amount.toFixed(2);
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()];
  
  if (symbol) {
    return `${symbol}${formattedAmount}`;
  }
  
  // Default: prefix with currency code
  return `${currency.toUpperCase()} ${formattedAmount}`;
}

/**
 * Parses a formatted currency string and returns the numeric amount
 * @param formatted - The formatted currency string
 * @returns The numeric amount
 */
export function parseCurrency(formatted: string): number {
  // Strip non-numeric characters except decimal point
  const numericString = formatted.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(numericString);
  
  if (isNaN(parsed)) {
    return 0;
  }
  
  return parsed;
}