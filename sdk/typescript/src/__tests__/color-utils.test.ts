import {hexToRgb, rgbToHex, lighten, darken, opacity} from '../color-utils';

describe('hexToRgb', () => {
  it('converts 6-char hex', () => expect(hexToRgb('#ff0000')).toEqual({r:255,g:0,b:0}));
  it('converts 3-char hex', () => expect(hexToRgb('#fff')).toEqual({r:255,g:255,b:255}));
  it('handles hex without hash', () => expect(hexToRgb('00ff00')).toEqual({r:0,g:255,b:0}));
  it('returns null for invalid input', () => expect(hexToRgb('xyz')).toBeNull());
  it('handles black', () => expect(hexToRgb('#000000')).toEqual({r:0,g:0,b:0}));
});

describe('rgbToHex', () => {
  it('converts red', () => expect(rgbToHex({r:255,g:0,b:0})).toBe('#ff0000'));
  it('converts white', () => expect(rgbToHex({r:255,g:255,b:255})).toBe('#ffffff'));
  it('clamps out-of-range values', () => expect(rgbToHex({r:300,g:-10,b:128})).toBe('#ff0080'));
});

describe('lighten', () => {
  it('returns same color when amount is 0', () => expect(lighten('#000000', 0)).toBe('#000000'));
  it('returns white when amount is 1', () => expect(lighten('#000000', 1)).toBe('#ffffff'));
  it('lightens by half', () => expect(lighten('#000000', 0.5)).toBe('#808080'));
});

describe('darken', () => {
  it('returns same color when amount is 0', () => expect(darken('#ffffff', 0)).toBe('#ffffff'));
  it('returns black when amount is 1', () => expect(darken('#ffffff', 1)).toBe('#000000'));
  it('darkens by half', () => expect(darken('#ffffff', 0.5)).toBe('#808080'));
});

describe('opacity', () => {
  it('applies full opacity', () => expect(opacity('#ff0000', 1)).toBe('rgba(255, 0, 0, 1)'));
  it('applies half opacity', () => expect(opacity('#00ff00', 0.5)).toBe('rgba(0, 255, 0, 0.5)'));
});