/**
 * Duration parsing and formatting utilities.
 * @package @countable/sdk
 */

export interface Duration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = MS_PER_SECOND * 60;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

/**
 * Convert milliseconds to a Duration object with integer fields.
 * @param ms - Total milliseconds to parse
 * @returns Duration object with days, hours, minutes, seconds, milliseconds
 */
export function parseDuration(ms: number): Duration {
  const days = Math.floor(ms / MS_PER_DAY);
  const hours = Math.floor((ms % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);
  const milliseconds = ms % MS_PER_SECOND;
  return { days, hours, minutes, seconds, milliseconds };
}

/**
 * Format a duration in milliseconds as a human-readable string.
 * @param ms - Total milliseconds
 * @param options - Formatting options
 * @param options.short - Use short format (e.g., "2d 3h 15m")
 * @returns Formatted duration string, skipping zero fields and milliseconds
 */
export function formatDuration(ms: number, options?: { short?: boolean }): string {
  const duration = parseDuration(ms);
  const short = options?.short ?? false;
  const parts: string[] = [];

  if (duration.days > 0) parts.push(short ? `${duration.days}d` : `${duration.days} day${duration.days > 1 ? 's' : ''}`);
  if (duration.hours > 0) parts.push(short ? `${duration.hours}h` : `${duration.hours} hour${duration.hours > 1 ? 's' : ''}`);
  if (duration.minutes > 0) parts.push(short ? `${duration.minutes}m` : `${duration.minutes} minute${duration.minutes > 1 ? 's' : ''}`);
  if (duration.seconds > 0 || (parts.length === 0 && ms >= 0)) {
    parts.push(short ? `${duration.seconds}s` : `${duration.seconds} second${duration.seconds !== 1 ? 's' : ''}`);
  }

  return parts.length > 0 ? parts.join(short ? ' ' : ', ') : (short ? '0s' : '0 seconds');
}

/**
 * Convert a Duration object back to total milliseconds.
 * @param duration - Partial Duration object with optional fields
 * @returns Total milliseconds (defaults missing fields to 0)
 */
export function durationToMs(duration: Partial<Duration>): number {
  return (
    (duration.days ?? 0) * MS_PER_DAY +
    (duration.hours ?? 0) * MS_PER_HOUR +
    (duration.minutes ?? 0) * MS_PER_MINUTE +
    (duration.seconds ?? 0) * MS_PER_SECOND +
    (duration.milliseconds ?? 0)
  );
}

/**
 * Format milliseconds as an ultra-short human-readable relative time string.
 * @param ms - Total milliseconds
 * @returns Ultra-short formatted string (e.g., "just now", "30s", "5m", "2h", "3d")
 */
export function humanizeMs(ms: number): string {
  if (ms < 5000) return 'just now';
  const seconds = Math.floor(ms / MS_PER_SECOND);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Compare two durations in milliseconds.
 * @param a - First duration in milliseconds
 * @param b - Second duration in milliseconds
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareDurations(a: number, b: number): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}