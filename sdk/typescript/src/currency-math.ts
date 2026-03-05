/**
 * Round a number to a specific number of decimal places.
 * roundTo(3.14159, 2) => 3.14
 * roundTo(3.145, 2) => 3.15
 * roundTo(100, 0) => 100
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  if (typeof decimals !== 'number' || !Number.isFinite(decimals) || decimals < 0) {
    decimals = 0;
  }
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Convert cents to dollars (or minor to major currency unit).
 * centsToMajor(1550) => 15.50
 * centsToMajor(100) => 1.00
 * centsToMajor(0) => 0.00
 * centsToMajor(99) => 0.99
 */
export function centsToMajor(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return cents / 100;
}

/**
 * Convert dollars to cents (or major to minor currency unit).
 * majorToCents(15.50) => 1550
 * majorToCents(1.00) => 100
 * majorToCents(0.99) => 99
 */
export function majorToCents(major: number): number {
  if (!Number.isFinite(major)) return 0;
  return Math.round(major * 100);
}