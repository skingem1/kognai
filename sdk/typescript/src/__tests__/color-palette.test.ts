import { lighten, darken, generateShades, contrastText } from '../color-palette';

describe('color-palette', () => {
  it('lighten lightens color', () => expect(lighten('#000000', 50)).toBe('#808080'));
  it('lighten 0% returns same color', () => expect(lighten('#ff0000', 0)).toBe('#ff0000'));
  it('lighten 100% returns white', () => expect(lighten('#000000', 100)).toBe('#ffffff'));
  it('darken darkens color', () => expect(darken('#ffffff', 50)).toBe('#808080'));
  it('darken 0% returns same color', () => expect(darken('#ff0000', 0)).toBe('#ff0000'));
  it('darken 100% returns black', () => expect(darken('#ffffff', 100)).toBe('#000000'));
  it('generateShades returns correct count', () => expect(generateShades('#ff0000', 5)).toHaveLength(5));
  it('generateShades first element is original color', () => expect(generateShades('#ff0000', 3)[0]).toBe('#ff0000'));
  it('contrastText returns black for light bg', () => expect(contrastText('#ffffff')).toBe('#000000'));
  it('contrastText returns white for dark bg', () => expect(contrastText('#000000')).toBe('#ffffff'));
});