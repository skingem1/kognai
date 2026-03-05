/**
 * Date utility functions for the frontend application.
 * These are pure utility functions that handle invalid input gracefully.
 */

/**
 * Check if a string is a valid date.
 * isValidDate('2026-02-18') => true
 * isValidDate('not-a-date') => false
 * isValidDate('') => false
 */
export function isValidDate(dateStr: string): boolean {
  if (!dateStr || dateStr.trim() === '') {
    return false;
  }
  const date = new Date(dateStr);
  return date.toString() !== 'Invalid Date';
}

/**
 * Check if a date string is today.
 * isToday('2026-02-18T10:00:00Z') => true (if today is Feb 18, 2026)
 */
export function isToday(dateStr: string): boolean {
  if (!isValidDate(dateStr)) {
    return false;
  }
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

/**
 * Check if a date string is in the past.
 * isPast('2020-01-01') => true
 */
export function isPast(dateStr: string): boolean {
  if (!isValidDate(dateStr)) {
    return false;
  }
  const date = new Date(dateStr);
  return date.getTime() < Date.now();
}

/**
 * Get the number of days between two dates (absolute value).
 * daysBetween('2026-01-01', '2026-01-10') => 9
 * daysBetween('2026-01-10', '2026-01-01') => 9
 */
export function daysBetween(dateStr1: string, dateStr2: string): number {
  if (!isValidDate(dateStr1) || !isValidDate(dateStr2)) {
    return NaN;
  }
  const date1 = new Date(dateStr1);
  const date2 = new Date(dateStr2);
  const diffMs = Math.abs(date2.getTime() - date1.getTime());
  return Math.floor(diffMs / 86400000);
}

/**
 * Format a date as ISO date only (no time).
 * toISODate('2026-02-18T10:30:00Z') => '2026-02-18'
 */
export function toISODate(dateStr: string): string {
  if (!isValidDate(dateStr)) {
    return '';
  }
  return new Date(dateStr).toISOString().split('T')[0];
}

/**
 * Get a human-readable time string.
 * formatTime('2026-02-18T14:30:00Z') => '2:30 PM' (using en-US locale)
 */
export function formatTime(dateStr: string): string {
  if (!isValidDate(dateStr)) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(dateStr));
}