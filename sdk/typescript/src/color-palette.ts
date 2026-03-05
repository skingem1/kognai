/**
 * Lighten a hex color by a percentage
 * @param hex - Hex color string (e.g. '#ff0000')
 * @param amount - Percentage to lighten (0-100)
 * @returns Lightened hex color string
 */
export function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const channel = (c: number) => Math.min(255, Math.round(c + (255 - c) * (amount / 100)));
  return '#' + [channel(r), channel(g), channel(b)].map(c => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Darken a hex color by a percentage
 * @param hex - Hex color string
 * @param amount - Percentage to darken (0-100)
 * @returns Darkened hex color string
 */
export function darken(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const channel = (c: number) => Math.max(0, Math.round(c * (1 - amount / 100)));
  return '#' + [channel(r), channel(g), channel(b)].map(c => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate an array of shades from a base color
 * @param hex - Base hex color
 * @param steps - Number of shades to generate
 * @returns Array of hex color strings from light to dark
 */
export function generateShades(hex: string, steps: number = 5): string[] {
  return Array.from({ length: steps }, (_, i) => darken(hex, (i / (steps - 1)) * 100));
}

/**
 * Get contrasting text color (black or white) for a background
 * @param hex - Background hex color
 * @param threshold - Luminance threshold (default 128)
 * @returns '#000000' or '#ffffff'
 */
export function contrastText(hex: string, threshold: number = 128): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance >= threshold ? '#000000' : '#ffffff';
}