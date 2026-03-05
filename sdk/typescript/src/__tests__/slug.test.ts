import { slugify, deslugify, isValidSlug, truncateSlug } from '../slug';

describe('slug', () => {
  describe('slugify', () => {
    it('basic: converts Hello World to hello-world', () => expect(slugify('Hello World')).toBe('hello-world'));
    it('special chars: removes special characters', () => expect(slugify('Hello! @World#')).toBe('hello-world'));
    it('multiple spaces: collapses spaces to hyphens', () => expect(slugify('foo   bar')).toBe('foo-bar'));
    it('accented chars: converts to ASCII', () => expect(slugify('café résumé')).toBe('cafe-resume'));
    it('leading/trailing: removes leading/trailing hyphens', () => expect(slugify('--hello--')).toBe('hello'));
    it('numbers: preserves numbers', () => expect(slugify('item 42 test')).toBe('item-42-test'));
    it('empty: returns empty string', () => expect(slugify('')).toBe(''));
    it('already slug: returns unchanged', () => expect(slugify('hello-world')).toBe('hello-world'));
  });

  describe('deslugify', () => {
    it('basic: converts hello-world to Hello World', () => expect(deslugify('hello-world')).toBe('Hello World'));
    it('single word: capitalizes first letter', () => expect(deslugify('hello')).toBe('Hello'));
    it('multiple hyphens: converts to spaced words', () => expect(deslugify('foo-bar-baz')).toBe('Foo Bar Baz'));
  });

  describe('isValidSlug', () => {
    it('valid: returns true for hello-world', () => expect(isValidSlug('hello-world')).toBe(true));
    it('valid single: returns true for single word', () => expect(isValidSlug('hello')).toBe(true));
    it('invalid uppercase: returns false for Hello', () => expect(isValidSlug('Hello')).toBe(false));
    it('invalid spaces: returns false for hello world', () => expect(isValidSlug('hello world')).toBe(false));
    it('invalid consecutive hyphens: returns false for hello--world', () => expect(isValidSlug('hello--world')).toBe(false));
    it('invalid leading hyphen: returns false for -hello', () => expect(isValidSlug('-hello')).toBe(false));
    it('empty: returns false for empty string', () => expect(isValidSlug('')).toBe(false));
  });

  describe('truncateSlug', () => {
    it('no truncation needed: returns hello', () => expect(truncateSlug('hello', 10)).toBe('hello'));
    it('truncates: cuts to maxLength characters', () => expect(truncateSlug('hello-world-foo', 11)).toBe('hello-world'));
    it('removes trailing hyphen: does not end with hyphen', () => expect(truncateSlug('hello-world', 6)).toBe('hello'));
  });
});