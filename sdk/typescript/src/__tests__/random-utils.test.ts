import { randomInt, randomFloat, randomChoice, randomShuffle, randomHex } from '../random-utils';

describe('random-utils', () => {
  it('randomInt returns value in range', () => {
    const result = randomInt(1, 10);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(10);
  });

  it('randomInt works with same min/max', () => {
    expect(randomInt(5, 5)).toBe(5);
  });

  it('randomFloat returns value in range', () => {
    const result = randomFloat(0, 1);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('randomFloat respects decimals', () => {
    const result = randomFloat(0, 1, 2);
    expect(result.toString()).toMatch(/^\d+(?:\.\d{1,2})?$/);
  });

  it('randomChoice returns element from array', () => {
    expect(['a', 'b', 'c']).toContain(randomChoice(['a', 'b', 'c']));
  });

  it('randomChoice returns undefined for empty array', () => {
    expect(randomChoice([])).toBeUndefined();
  });

  it('randomShuffle returns new array', () => {
    const arr = [1, 2, 3];
    expect(randomShuffle(arr)).not.toBe(arr);
  });

  it('randomShuffle preserves elements', () => {
    expect(randomShuffle([1, 2, 3]).sort()).toEqual([1, 2, 3]);
  });

  it('randomShuffle does not mutate original', () => {
    const arr = [1, 2, 3];
    randomShuffle(arr);
    expect(arr).toEqual([1, 2, 3]);
  });

  it('randomHex default length is 8', () => {
    expect(randomHex()).toHaveLength(8);
  });

  it('randomHex custom length', () => {
    expect(randomHex(16)).toHaveLength(16);
  });

  it('randomHex only contains hex chars', () => {
    expect(randomHex(32)).toMatch(/^[0-9a-f]+$/);
  });
});