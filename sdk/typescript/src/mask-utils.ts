/**
 * @file mask-utils.ts
 * @description Utilities for masking sensitive data
 */

/**
 * Masks an email address, showing first 2 chars of local part + '***@' + domain
 * @param email - The email address to mask
 * @returns Masked email string (e.g., 'john.doe@gmail.com' => 'jo***@gmail.com')
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const visible = local.length < 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

/**
 * Masks a phone number, keeping last 4 digits visible
 * @param phone - The phone number to mask
 * @returns Masked phone string (e.g., '+1234567890' => '******7890')
 */
export function maskPhone(phone: string): string {
  return phone.length <= 4 ? '****'.slice(-phone.length) : '*'.repeat(phone.length - 4) + phone.slice(-4);
}

/**
 * Masks a card number, showing only last 4 digits
 * @param cardNumber - The card number to mask
 * @returns Masked card string (e.g., '4111111111111111' => '************1111')
 */
export function maskCard(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  return '*'.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
}

/**
 * Generic string masking function
 * @param str - The string to mask
 * @param visibleStart - Number of chars to show at start (default: 2)
 * @param visibleEnd - Number of chars to show at end (default: 2)
 * @returns Masked string (e.g., maskString('secretkey123', 2, 3) => 'se*******123')
 */
export function maskString(str: string, visibleStart = 2, visibleEnd = 2): string {
  if (str.length <= visibleStart + visibleEnd) return '*'.repeat(str.length);
  return str.slice(0, visibleStart) + '*'.repeat(str.length - visibleStart - visibleEnd) + str.slice(-visibleEnd);
}