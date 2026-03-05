/**
 * English pluralization utilities
 * @packageDocumentation
 */

/**
 * Returns the singular or plural form based on count
 * @param count - The quantity to check
 * @param singular - The singular form
 * @param plural - Optional plural form (defaults to singular + 's')
 * @returns Singular if count === 1, otherwise plural
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? singular + 's');
}

/**
 * Returns count + pluralized word
 * @param count - The quantity
 * @param singular - The singular form
 * @param plural - Optional plural form
 * @returns Count followed by pluralized form
 */
export function pluralizeWithCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}

/**
 * Applies basic English pluralization rules
 * @param singular - The word to pluralize
 * @returns The pluralized form
 */
export function autoPluralize(singular: string): string {
  if (/(s|sh|ch|x|z)$/.test(singular)) return singular + 'es';
  if (/[^aeiou]y$/.test(singular)) return singular.slice(0, -1) + 'ies';
  return singular + 's';
}