import { pluralize, pluralizeWithCount, autoPluralize } from '../pluralize';

describe('pluralize', () => {
  test.each`
    count | singular   | plural      | expected
    ${1}  | ${'item'}  | ${'items'}  | ${'item'}
    ${5}  | ${'item'}  | ${'items'}  | ${'items'}
    ${0}  | ${'child'} | ${'children'} | ${'children'}
    ${1}  | ${'mouse'} | ${'mice'}   | ${'mouse'}
    ${2}  | ${'mouse'} | ${'mice'}   | ${'mice'}
  `('pluralize($count, $singular, $plural) => $expected', ({ count, singular, plural, expected }) => {
    expect(pluralize(count, singular, plural)).toBe(expected);
  });

  test.each`
    count | singular   | plural      | expected
    ${1}  | ${'item'}  | ${'items'}  | ${'1 item'}
    ${5}  | ${'item'}  | ${'items'}  | ${'5 items'}
    ${0}  | ${'child'} | ${'children'} | ${'0 children'}
  `('pluralizeWithCount($count, $singular, $plural) => $expected', ({ count, singular, plural, expected }) => {
    expect(pluralizeWithCount(count, singular, plural)).toBe(expected);
  });

  test.each`
    singular  | expected
    ${'box'}  | ${'boxes'}
    ${'city'} | ${'cities'}
    ${'cat'}  | ${'cats'}
    ${'bus'}  | ${'buses'}
    ${'church'} | ${'churches'}
    ${'day'}  | ${'days'}
  `('autoPluralize($singular) => $expected', ({ singular, expected }) => {
    expect(autoPluralize(singular)).toBe(expected);
  });
});