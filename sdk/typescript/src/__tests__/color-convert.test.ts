import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb } from '../color-convert';

describe('color-convert', () => {
  it('hexToRgb converts full hex with hash', () => expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 }));
  it('hexToRgb converts shorthand hex', () => expect(hexToRgb('#F00')).toEqual({ r: 255, g: 0, b: 0 }));
  it('hexToRgb converts hex without hash', () => expect(hexToRgb('00FF00')).toEqual({ r: 0, g: 255, b: 0 }));
  it('hexToRgb returns null for invalid', () => expect(hexToRgb('invalid')).toBeNull());
  it('hexToRgb returns null for invalid hex chars', () => expect(hexToRgb('#GGG')).toBeNull());
  it('rgbToHex converts red', () => expect(rgbToHex(255, 0, 0)).toBe('#ff0000'));
  it('rgbToHex converts green', () => expect(rgbToHex(0, 255, 0)).toBe('#00ff00'));
  it('rgbToHex clamps out-of-range values', () => expect(rgbToHex(300, -10, 128)).toBe('#ff0080'));
  it('rgbToHsl converts pure red', () => expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 }));
  it('rgbToHsl converts black', () => expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 }));
  it('rgbToHsl converts white', () => expect(rgbToHsl(255, 255, 255)).toEqual({ h: 0, s: 0, l: 100 }));
  it('hslToRgb converts red', () => expect(hslToRgb(0, 100, 50)).toEqual({ r: 255, g: 0, b: 0 }));
  it('hslToRgb converts green', () => expect(hslToRgb(120, 100, 50)).toEqual({ r: 0, g: 255, b: 0 }));
  it('hslToRgb converts gray', () => expect(hslToRgb(0, 0, 50)).toEqual({ r: 128, g: 128, b: 128 }));
});