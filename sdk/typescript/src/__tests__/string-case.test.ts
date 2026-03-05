import { camelCase, snakeCase, kebabCase, pascalCase } from '../string-case';

describe('string-case', () => {
  it('camelCase converts hello-world to helloWorld', () => expect(camelCase('hello-world')).toBe('helloWorld'));
  it('camelCase converts foo_bar_baz to fooBarBaz', () => expect(camelCase('foo_bar_baz')).toBe('fooBarBaz'));
  it('camelCase converts Hello World to helloWorld', () => expect(camelCase('Hello World')).toBe('helloWorld'));
  it('snakeCase converts helloWorld to hello_world', () => expect(snakeCase('helloWorld')).toBe('hello_world'));
  it('snakeCase converts FOO-BAR to foo_bar', () => expect(snakeCase('FOO-BAR')).toBe('foo_bar'));
  it('snakeCase converts hello world to hello_world', () => expect(snakeCase('hello world')).toBe('hello_world'));
  it('kebabCase converts helloWorld to hello-world', () => expect(kebabCase('helloWorld')).toBe('hello-world'));
  it('kebabCase converts foo_bar to foo-bar', () => expect(kebabCase('foo_bar')).toBe('foo-bar'));
  it('kebabCase converts Hello World to hello-world', () => expect(kebabCase('Hello World')).toBe('hello-world'));
  it('pascalCase converts hello-world to HelloWorld', () => expect(pascalCase('hello-world')).toBe('HelloWorld'));
  it('pascalCase converts foo_bar to FooBar', () => expect(pascalCase('foo_bar')).toBe('FooBar'));
  it('pascalCase converts hello to Hello', () => expect(pascalCase('hello')).toBe('Hello'));
  it('camelCase handles empty string', () => expect(camelCase('')).toBe(''));
  it('snakeCase handles already_snake', () => expect(snakeCase('already_snake')).toBe('already_snake'));
});