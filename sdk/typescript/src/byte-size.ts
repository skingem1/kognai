/**
 * Converts bytes to a human-readable string using binary units (B, KB, MB, GB, TB, PB).
 * @example formatBytes(1536) => '1.50 KB'
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(decimals)} ${units[i]}`;
}

/** Parses a human-readable byte string (e.g., '1.5 KB', '2MB', '1 gb') to bytes. Returns NaN for invalid input. */
export function parseBytes(str: string): number {
  const match = String(str).match(/^(\d+(?:\.\d+)?)\s*([KMGTP]?B)$/i);
  if (!match) return NaN;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase().replace('B', 'B');
  const map: Record<string, number> = { B: 0, KB: 1, MB: 2, GB: 3, TB: 4, PB: 5 };
  return map[unit] !== undefined ? value * 1024 ** map[unit] : NaN;
}

/** Checks if byte count is within a human-readable limit string. */
export function isWithinLimit(bytes: number, limit: string): boolean {
  const limitBytes = parseBytes(limit);
  return !isNaN(limitBytes) && bytes <= limitBytes;
}