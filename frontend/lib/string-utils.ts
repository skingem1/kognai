/**
 * String utility functions for the frontend application.
 * Pure functions with no external dependencies.
 */

/**
 * Convert a string to a URL-safe slug.
 * slugify('Hello World!') => 'hello-world'
 * slugify('  My API Key  ') => 'my-api-key'
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Capitalize the first letter of a string.
 * capitalize('hello') => 'Hello'
 * capitalize('') => ''
 * capitalize('HELLO') => 'HELLO'
 */
export function capitalize(text: string): string {
  if (!text) {
    return '';
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Simple English pluralization.
 * pluralize('invoice', 0) => 'invoices'
 * pluralize('invoice', 1) => 'invoice'
 * pluralize('invoice', 5) => 'invoices'
 * pluralize('key', 2, 'keys') => 'keys'
 */
export function pluralize(word: string, count: number, plural?: string): string {
  if (count === 1) {
    return word;
  }
  if (plural) {
    return plural;
  }
  return word + 's';
}

/**
 * Mask an email address for display.
 * maskEmail('john@example.com') => 'j***@example.com'
 * maskEmail('ab@test.com') => 'a***@test.com'
 * maskEmail('') => ''
 * maskEmail('invalid') => 'invalid'
 */
export function maskEmail(email: string): string {
  if (!email) {
    return '';
  }
  if (!email.includes('@')) {
    return email;
  }
  const [localPart, domain] = email.split('@');
  return `${localPart.charAt(0)}***@${domain}`;
}

/**
 * Get initials from a name (max 2 characters).
 * initials('John Doe') => 'JD'
 * initials('Alice') => 'A'
 * initials('John Middle Doe') => 'JD' (first and last)
 * initials('') => ''
 */
export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts[parts.length - 1]?.charAt(0) ?? '';
  return (first + last).toUpperCase();
}