import {hexToRgb, rgbToHex, lighten, darken, withAlpha} from '../color-utils';

describe('color-utils', () => {
  describe('hexToRgb', () => {
    it('1: converts #ff0000 to {r:255,g:0,b:0}', () => expect(hexToRgb('#ff0000')).toEqual({r:255,g:0,b:0}));
    it('2: converts #00ff00 to {r:0,g:255,b:0}', () => expect(hexToRgb('#00ff00')).toEqual({r:0,g:255,b:0}));
    it('3: converts #0000ff to {r:0,g:0,b:255}', () => expect(hexToRgb('#0000ff')).toEqual({r:0,g:0,b:255}));
    it('4: handles shorthand #f00', () => expect(hexToRgb('#f00')).toEqual({r:255,g:0,b:0}));
    it('5: handles without hash ff0000', () => expect(hexToRgb('ff0000')).toEqual({r:255,g:0,b:0}));
    it('6: returns null for invalid string xyz', () => expect(hexToRgb('xyz')).toBeNull());
    it('7: returns null for empty string', () => expect(hexToRgb('')).toBeNull());
  });

  describe('rgbToHex', () => {
    it('8: converts (255,0,0) to #ff0000', () => expect(rgbToHex(255,0,0)).toBe('#ff0000'));
    it('9: converts (0,128,255) to #0080ff', () => expect(rgbToHex(0,128,255)).toBe('#0080ff'));
    it('10: clamps above 255 (300,0,0)=>#ff0000', () => expect(rgbToHex(300,0,0)).toBe('#ff0000'));
    it('11: clamps below 0 (-10,0,0)=>#000000', () => expect(rgbToHex(-10,0,0)).toBe('#000000'));
  });

  describe('lighten', () => {
    it('12: lighten(#000000, 0)=#000000', () => expect(lighten('#000000', 0)).toBe('#000000'));
    it('13: lighten(#000000, 1)=#ffffff', () => expect(lighten('#000000', 1)).toBe('#ffffff'));
    it('14: lighten(#000000, 0.5)≈#808080 each channel ±2', () => {
      const rgb = hexToRgb(lighten('#000000', 0.5));
      expect(rgb.r).toBeGreaterThanOrEqual(126); expect(rgb.r).toBeLessThanOrEqual(130);
      expect(rgb.g).toBeGreaterThanOrEqual(126); expect(rgb.g).toBeLessThanOrEqual(130);
      expect(rgb.b).toBeGreaterThanOrEqual(126); expect(rgb.b).toBeLessThanOrEqual(130);
    });
    it('15: returns original hex for invalid input', () => expect(lighten('invalid', 0.5)).toBe('invalid'));
  });

  describe('darken', () => {
    it('16: darken(#ffffff, 0)=#ffffff', () => expect(darken('#ffffff', 0)).toBe('#ffffff'));
    it('17: darken(#ffffff, 1)=#000000', () => expect(darken('#ffffff', 1)).toBe('#000000'));
    it('18: darken(#ffffff, 0.5)≈#808080 each channel ±2', () => {
      const rgb = hexToRgb(darken('#ffffff', 0.5));
      expect(rgb.r).toBeGreaterThanOrEqual(126); expect(rgb.r).toBeLessThanOrEqual(130);
      expect(rgb.g).toBeGreaterThanOrEqual(126); expect(rgb.g).toBeLessThanOrEqual(130);
      expect(rgb.b).toBeGreaterThanOrEqual(126); expect(rgb.b).toBeLessThanOrEqual(130);
    });
  });

  describe('withAlpha', () => {
    it('19: withAlpha(#ff0000, 0.5)=rgba(255,0,0,0.5)', () => expect(withAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)'));
    it('20: withAlpha(#00ff00, 1)=rgba(0,255,0,1)', () => expect(withAlpha('#00ff00', 1)).toBe('rgba(0, 255, 0, 1)'));
    it('21: clamps alpha above 1 withAlpha(#000,2)=rgba(0,0,0,1)', () => expect(withAlpha('#000', 2)).toBe('rgba(0, 0, 0, 1)'));
    it('22: returns fallback for invalid hex', () => expect(withAlpha('xyz', 0.5)).toBe('rgba(0, 0, 0, 0)'));
  });
});