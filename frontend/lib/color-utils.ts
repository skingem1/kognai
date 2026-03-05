/**
 * Converts a hex color string to an RGB object.
 * Supports both 3-character (#RGB) and 6-character (#RRGGBB) formats.
 * @param hex - The hex color string (with or without leading #)
 * @returns RGB object or null if invalid
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const sanitized = hex.replace(/^#/, '');

  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(sanitized)) {
    return null;
  }

  const fullHex = sanitized.length === 3
    ? sanitized.split('').map(c => c + c).join('')
    : sanitized;

  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);

  if (!result) {
    return null;
  }

  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Converts RGB values to a hex string with leading #.
 * @param r - Red value (0-255)
 * @param g - Green value (0-255)
 * @param b - Blue value (0-255)
 * @returns Lowercase hex string with leading #
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));

  const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Lightens a hex color by a given percentage.
 * @param hex - The hex color string
 * @param amount - Amount to lighten (0 = original, 1 = white)
 * @returns Lightened hex color string, or original if invalid
 */
export function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const clampedAmount = Math.max(0, Math.min(1, amount));

  return rgbToHex(
    rgb.r + (255 - rgb.r) * clampedAmount,
    rgb.g + (255 - rgb.g) * clampedAmount,
    rgb.b + (255 - rgb.b) * clampedAmount
  );
}

/**
 * Darkens a hex color by a given percentage.
 * @param hex - The hex color string
 * @param amount - Amount to darken (0 = original, 1 = black)
 * @returns Darkened hex color string, or original if invalid
 */
export function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const clampedAmount = Math.max(0, Math.min(1, amount));

  return rgbToHex(
    rgb.r * (1 - clampedAmount),
    rgb.g * (1 - clampedAmount),
    rgb.b * (1 - clampedAmount)
  );
}

/**
 * Converts a hex color to an rgba() CSS string.
 * @param hex - The hex color string
 * @param alpha - Alpha value (0-1), clamped to valid range
 * @returns rgba() CSS string, or rgba(0, 0, 0, 1) if invalid hex
 */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);

  if (!rgb) {
    return 'rgba(0, 0, 0, 1)';
  }

  const clampedAlpha = Math.max(0, Math.min(1, alpha));

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clampedAlpha})`;
}