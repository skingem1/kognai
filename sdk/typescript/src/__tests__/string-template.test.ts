import {template, templateStrict, extractVariables, escapeHtml, unescapeHtml, truncate} from '../string-template';

describe('string-template', () => {
  it('basic', () => expect(template('Hello {{name}}', {name:'World'})).toBe('Hello World'));
  it('multiple', () => expect(template('{{a}} and {{b}}', {a:'X',b:'Y'})).toBe('X and Y'));
  it('missing var left as-is', () => expect(template('Hello {{name}}', {})).toBe('Hello {{name}}'));
  it('whitespace in braces', () => expect(template('Hello {{ name }}', {name:'World'})).toBe('Hello World'));
  it('numbers', () => expect(template('Count: {{n}}', {n:42})).toBe('Count: 42'));
  it('booleans', () => expect(template('Active: {{v}}', {v:true})).toBe('Active: true'));
  it('no placeholders', () => expect(template('plain text', {})).toBe('plain text'));
  it('templateStrict works with all vars', () => expect(templateStrict('{{a}}', {a:'x'})).toBe('x'));
  it('templateStrict throws on missing', () => expect(()=>templateStrict('{{a}}', {})).toThrow('Missing template variable: a'));
  it('extractVariables extracts vars', () => expect(extractVariables('{{a}} and {{b}}')).toEqual(['a','b']));
  it('extractVariables deduplicates', () => expect(extractVariables('{{a}} {{a}}')).toEqual(['a']));
  it('extractVariables empty', () => expect(extractVariables('no vars')).toEqual([]));
  it('escapeHtml escapes', () => expect(escapeHtml('<b>"test"</b>')).toBe('&lt;b&gt;&quot;test&quot;&lt;/b&gt;'));
  it('unescapeHtml roundtrip', () => expect(unescapeHtml(escapeHtml('<b>&</b>'))).toBe('<b>&</b>'));
  it('truncate no truncation needed', () => expect(truncate('hello', 10)).toBe('hello'));
  it('truncate truncates', () => expect(truncate('hello world', 8)).toBe('hello...'));
  it('truncate custom suffix', () => expect(truncate('hello world', 8, '~')).toBe('hello w~'));
});