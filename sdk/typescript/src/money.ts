export interface Money {
  amount: number;
  currency: string;
}

/**
 * Creates a Money object with amount in smallest currency unit.
 * @param amount - Integer amount in smallest unit (cents for USD, pence for GBP)
 * @param currency - ISO 4217 uppercase 3-letter currency code
 * @returns Frozen Money object with amount and currency
 */
function createMoney(amount: number, currency: string): Money {
  if (!Number.isInteger(amount)) throw new Error(`Amount must be integer (smallest unit), got ${amount}`);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`Currency must be 3 uppercase ISO 4217 letters, got ${currency}`);
  return Object.freeze({ amount, currency });
}

/**
 * Adds two Money values, throwing if currencies differ.
 * @param a - First Money value to add
 * @param b - Second Money value to add
 * @returns New Money object with combined amount in same currency
 */
function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error(`Cannot add different currencies: ${a.currency} and ${b.currency}`);
  return createMoney(a.amount + b.amount, a.currency);
}

/**
 * Subtracts second Money from first, throwing if currencies differ.
 * @param a - Money value to subtract from (minuend)
 * @param b - Money value to subtract (subtrahend)
 * @returns New Money object with difference amount
 */
function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error(`Cannot subtract different currencies: ${a.currency} and ${b.currency}`);
  return createMoney(a.amount - b.amount, a.currency);
}

/**
 * Multiplies Money amount by a factor, rounding to nearest integer.
 * @param money - Money value to multiply
 * @param factor - Numeric factor to multiply by
 * @returns New Money object with rounded result
 */
function multiplyMoney(money: Money, factor: number): Money {
  return createMoney(Math.round(money.amount * factor), money.currency);
}

/**
 * Formats Money as currency string in major units.
 * @param money - Money value to format
 * @param locale - Locale string for Intl.NumberFormat (default 'en-US')
 * @returns Formatted currency string (e.g., "$10.50" for 1050 cents)
 */
function formatMoney(money: Money, locale?: string): string {
  return new Intl.NumberFormat(locale ?? 'en-US', { style: 'currency', currency: money.currency }).format(money.amount / 100);
}

/**
 * Checks if Money amount is zero.
 * @param money - Money value to check
 * @returns True if amount equals zero
 */
function isZero(money: Money): boolean { return money.amount === 0; }

/**
 * Checks if Money amount is positive (greater than zero).
 * @param money - Money value to check
 * @returns True if amount is greater than zero
 */
function isPositive(money: Money): boolean { return money.amount > 0; }

/**
 * Checks if Money amount is negative (less than zero).
 * @param money - Money value to check
 * @returns True if amount is less than zero
 */
function isNegative(money: Money): boolean { return money.amount < 0; }

/**
 * Compares two Money values, throwing if currencies differ.
 * @param a - First Money value to compare
 * @param b - Second Money value to compare
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 */
function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (a.currency !== b.currency) throw new Error(`Cannot compare different currencies: ${a.currency} and ${b.currency}`);
  return a.amount === b.amount ? 0 : a.amount < b.amount ? -1 : 1;
}

export { createMoney, addMoney, subtractMoney, multiplyMoney, formatMoney, isZero, isPositive, isNegative, compareMoney };