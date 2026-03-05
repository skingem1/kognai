/**
 * Truncate string to maxLength including suffix
 * @param str - String to truncate
 * @param maxLength - Maximum length including suffix
 * @param suffix - Suffix to append (default: '...')
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) return str;
  const available = maxLength - suffix.length;
  if (available <= 0) return suffix.slice(0, maxLength);
  return str.slice(0, available) + suffix;
}

/**
 * Keep start and end, truncate middle
 * @param str - String to truncate
 * @param maxLength - Maximum length including separator
 * @param separator - Separator string (default: '...')
 * @returns Truncated string
 */
export function truncateMiddle(str: string, maxLength: number, separator = '...'): string {
  if (str.length <= maxLength) return str;
  const sepLen = separator.length;
  if (maxLength <= sepLen) return separator.slice(0, maxLength);
  const startLen = Math.ceil((maxLength - sepLen) / 2);
  const endLen = Math.floor((maxLength - sepLen) / 2);
  return str.slice(0, startLen) + separator + str.slice(-endLen);
}

/**
 * Truncate to N words
 * @param str - String to truncate
 * @param maxWords - Maximum number of words
 * @param suffix - Suffix to append (default: '...')
 * @returns Truncated string
 */
export function truncateWords(str: string, maxWords: number, suffix = '...'): string {
  const words = str.trim().split(/\s+/);
  if (words.length <= maxWords) return str;
  return words.slice(0, maxWords).join(' ') + suffix;
}