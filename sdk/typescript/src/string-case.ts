/**
 * Splits a string by inserting separator before uppercase letters, then splits on non-alphanumeric characters.
 * @param s - The input string to split into words
 * @returns An array of lowercase word strings
 * @example
 * words('helloWorld') // ['hello', 'world']
 * words('foo-bar_baz') // ['foo', 'bar', 'baz']
 */
const words = (s: string): string[] => s.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^a-zA-Z0-9]+/).filter(Boolean).map(w => w.toLowerCase());

/**
 * Converts a string to camelCase.
 * @param str - The input string to convert
 * @returns The string in camelCase format
 * @example
 * camelCase('hello-world') // 'helloWorld'
 * camelCase('foo_bar_baz') // 'fooBarBaz'
 */
export const camelCase = (str: string): string => {
  const w = words(str);
  return w.length ? w[0] + w.slice(1).map(w => w[0].toUpperCase() + w.slice(1)).join('') : '';
};

/**
 * Converts a string to snake_case.
 * @param str - The input string to convert
 * @returns The string in snake_case format
 * @example
 * snakeCase('helloWorld') // 'hello_world'
 * snakeCase('FOO-BAR') // 'foo_bar'
 */
export const snakeCase = (str: string): string => words(str).join('_');

/**
 * Converts a string to kebab-case.
 * @param str - The input string to convert
 * @returns The string in kebab-case format
 * @example
 * kebabCase('helloWorld') // 'hello-world'
 */
export const kebabCase = (str: string): string => words(str).join('-');

/**
 * Converts a string to PascalCase.
 * @param str - The input string to convert
 * @returns The string in PascalCase format
 * @example
 * pascalCase('hello-world') // 'HelloWorld'
 */
export const pascalCase = (str: string): string => words(str).map(w => w[0].toUpperCase() + w.slice(1)).join('');