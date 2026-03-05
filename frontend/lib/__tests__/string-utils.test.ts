import { slugify, capitalize, pluralize, maskEmail, initials } from '../string-utils';

describe('slugify', () => {
  it('converts normal string to slug', () => expect(slugify('Hello World!')).toBe('hello-world'));
  it('trims and converts string with extra spaces', () => expect(slugify('  My API Key  ')).toBe('my-api-key'));
  it('collapses multiple hyphens to single hyphen', () => expect(slugify('hello--world')).toBe('hello-world'));
  it('handles empty string', () => expect(slugify('')).toBe(''));
  it('handles special characters, numbers and unicode', () => expect(slugify('Test123_@#')).toBe('test123'));
});

describe('capitalize', () => {
  it('capitalizes lowercase string', () => expect(capitalize('hello')).toBe('Hello'));
  it('returns empty string unchanged', () => expect(capitalize('')).toBe(''));
  it('keeps uppercase string uppercase', () => expect(capitalize('HELLO')).toBe('HELLO'));
  it('capitalizes single character', () => expect(capitalize('a')).toBe('A'));
});

describe('pluralize', () => {
  it('returns plural form for count 0', () => expect(pluralize('invoice', 0)).toBe('invoices'));
  it('returns singular form for count 1', () => expect(pluralize('invoice', 1)).toBe('invoice'));
  it('returns plural form for count > 1', () => expect(pluralize('invoice', 5)).toBe('invoices'));
  it('uses custom plural for count 2', () => expect(pluralize('key', 2, 'keys')).toBe('keys'));
  it('uses custom plural for count 3', () => expect(pluralize('child', 3, 'children')).toBe('children'));
});

describe('maskEmail', () => {
  it('masks email with multiple chars before @', () => expect(maskEmail('john@example.com')).toBe('j***@example.com'));
  it('masks email with single char before @', () => expect(maskEmail('ab@test.com')).toBe('a***@test.com'));
  it('returns empty string for empty input', () => expect(maskEmail('')).toBe(''));
  it('returns invalid email unchanged', () => expect(maskEmail('invalid')).toBe('invalid'));
});

describe('initials', () => {
  it('returns initials for two word name', () => expect(initials('John Doe')).toBe('JD'));
  it('returns single letter for single name', () => expect(initials('Alice')).toBe('A'));
  it('returns initials for three word name', () => expect(initials('John Middle Doe')).toBe('JD'));
  it('returns empty string for empty input', () => expect(initials('')).toBe(''));
});