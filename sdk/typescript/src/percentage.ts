/**
 * Calculate percentage.
 * percentage(25, 100) => 25
 * percentage(1, 3) => 33.33 (2 decimal places)
 * percentage(0, 100) => 0
 * @param part - The part value
 * @param total - The total value
 * @param decimals - Number of decimal places (default 2)
 */
export function percentage(part: number, total: number, decimals: number = 2): number {
  if (total === 0) {
    return 0;
  }

  const result = (part / total) * 100;

  const multiplier = Math.pow(10, decimals);
  return Math.round(result * multiplier) / multiplier;
}