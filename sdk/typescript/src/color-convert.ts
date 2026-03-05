export type RGB = { r: number; g: number; b: number };
export type HSL = { h: number; s: number; l: number };

/** @param hex - Hex color string (3 or 6 chars, optional #) @returns RGB object or null if invalid */
export function hexToRgb(hex: string): RGB | null {
  const h = hex.replace(/^#/, '');
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(h)) return null;
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const parsePair = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return { r: parsePair(0), g: parsePair(2), b: parsePair(4) };
}

/** @param r - Red (0-255) @param g - Green (0-255) @param b - Blue (0-255) @returns Lowercase hex string */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** @param r - Red (0-255) @param g - Green (0-255) @param b - Blue (0-255) @returns HSL object with h(0-360), s(0-100), l(0-100) */
export function rgbToHsl(r: number, g: number, b: number): HSL {
  const n = (v: number) => v / 255, rn = n(r), gn = n(g), bn = n(b);
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** @param h - Hue (0-360) @param s - Saturation (0-100) @param l - Lightness (0-100) @returns RGB object */
export function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100; l /= 100; h = ((h % 360) + 360) % 360;
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; } else if (h < 120) { r1 = x; g1 = c; } else if (h < 180) { g1 = c; b1 = x; } else if (h < 240) { g1 = x; b1 = c; } else if (h < 300) { r1 = x; b1 = c; } else { r1 = c; b1 = x; }
  return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
}