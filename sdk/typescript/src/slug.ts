/**
 * URL slug generation and manipulation utilities.
 * @package @countable/sdk
 */

const ACCENT_MAP: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o', ø: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ñ: 'n', ç: 'c', ß: 's', ÿ: 'y', œ: 'oe', æ: 'ae'
};

/**
 * Converts a string to a URL-friendly slug.
 * @param input - The string to convert to a slug
 * @returns The slugified string
 */
export function slugify(input: string): string {
  let result = input.toLowerCase();
  for (const [accent, ascii] of Object.entries(ACCENT_MAP)) {
    result = result.replace(new RegExp(accent, 'g'), ascii);
  }
  result = result.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  return result.replace(/^-+|-+$/g, '');
}

/**
 * Converts a slug back to a human-readable title case string.
 * @param slug - The slug to convert
 * @returns The deslugified string
 */
export function deslugify(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Validates whether a string is a valid slug format.
 * @param slug - The slug to validate
 * @returns True if the slug is valid, false otherwise
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/**
 * Truncates a slug to a maximum length while preserving word boundaries.
 * @param slug - The slug to truncate
 * @param maxLength - Maximum allowed length
 * @returns The truncated slug
 */
export function truncateSlug(slug: string, maxLength: number): string {
  if (slug.length <= maxLength) return slug;
  let result = slug.slice(0, maxLength);
  if (result.endsWith('-')) result = result.slice(0, -1);
  return result;
}