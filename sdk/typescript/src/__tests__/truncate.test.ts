import { truncate, truncateMiddle, truncateWords } from '../truncate';

describe('truncate', () => {
  it('truncates with default ellipsis', () => {
    expect(truncate('Hello World', 8)).toBe('Hello...');
  });

  it('returns original if shorter than max', () => {
    expect(truncate('Hi', 10)).toBe('Hi');
  });

  it('uses custom ellipsis', () => {
    expect(truncate('Hello World', 8, '…')).toBe('Hello W…');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('truncateMiddle truncates middle', () => {
    expect(truncateMiddle('abcdefghij', 7)).toBe('ab...ij');
  });

  it('truncateMiddle with custom ellipsis', () => {
    expect(truncateMiddle('abcdefghij', 7, '~')).toBe('abc~hij');
  });

  it('truncateMiddle returns original if shorter', () => {
    expect(truncateMiddle('abc', 10)).toBe('abc');
  });

  it('truncateWords limits word count', () => {
    expect(truncateWords('one two three four', 2)).toBe('one two...');
  });

  it('truncateWords with custom ellipsis', () => {
    expect(truncateWords('one two three four', 2, '…')).toBe('one two…');
  });

  it('truncateWords returns original if exact count', () => {
    expect(truncateWords('hello', 5)).toBe('hello');
  });

  it('truncateWords handles zero words', () => {
    expect(truncateWords('a b c', 0)).toBe('...');
  });
});