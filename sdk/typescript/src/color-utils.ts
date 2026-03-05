/**
 * Represents an RGB color with channels 0-255.
 */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Converts a hex color string to an RGB object.
 * @param hex - 3-char (#fff) or 6-char (#ffffff) hex string, with optional leading #
 * @returns RGB object or null if invalid
 */
export function hexToRgb(hex: string): RGB | null {
  const cleaned = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  const expanded = cleaned.length === 3
    ? cleaned.split('').map(c => c + c).join('')
    : cleaned;
  const num = parseInt(expanded, 16);
  if (isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/**
 * Converts an RGB object to a 6-char hex string with leading #.
 * @param rgb - RGB object with channels 0-255
 * @returns Hex string (e.g., "#ff0000")
 */
export function rgbToHex(rgb: RGB): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [rgb.r, rgb.g, rgb.b].map(c => clamp(c).toString(16).padStart(2, '0')).join('');
}

/**
 * Lightens a hex color by moving each channel toward 255.
 * @param hex - Hex color string
 * @param amount - 0 to 1 (0 = no change, 1 = white)
 * @returns Lightened hex string
 */
export function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const adjust = (c: number) => Math.round(c + (255 - c) * amount);
  return rgbToHex({ r: adjust(rgb.r), g: adjust(rgb.g), b: adjust(rgb.b) });
}

/**
 * Darkens a hex color by scaling each channel toward 0.
 * @param hex - Hex color string
 * @param amount - 0 to 1 (0 = no change, 1 = black)
 * @returns Darkened hex string
 */
export function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const adjust = (c: number) => Math.round(c * (1 - amount));
  return rgbToHex({ r: adjust(rgb.r), g: adjust(rgb.g), b: adjust(rgb.b) });
}

/**
 * Converts hex to rgba() CSS string with specified alpha.
 * @param hex - Hex color string
 * @param alpha - 0 to 1
 * @returns RGBA CSS string
 */
export function opacity(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}