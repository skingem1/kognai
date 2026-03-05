import { memoize, memoizeWith, memoizeLast } from '../memo';

describe('memo', () => {
  it('memoize returns cached result', () => {
    const fn = jest.fn((x: number) => x * 2);
    const mFn = memoize(fn);
    expect(mFn(5)).toBe(10);
    expect(mFn(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('memoize caches different args separately', () => {
    const fn = jest.fn((x: number) => x * 2);
    const mFn = memoize(fn);
    mFn(1);
    mFn(2);
    mFn(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('memoizeWith uses custom key', () => {
    const fn = jest.fn((a: number, b: number) => a + b);
    const mFn = memoizeWith(fn, (a, b) => `${a}:${b}`);
    expect(mFn(1, 2)).toBe(3);
    expect(mFn(1, 2)).toBe(3);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('memoizeWith different keys call fn again', () => {
    const fn = jest.fn((a: number, b: number) => a + b);
    const mFn = memoizeWith(fn, (a, b) => `${a}:${b}`);
    mFn(1, 2);
    mFn(3, 4);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('memoizeLast caches only last result', () => {
    const fn = jest.fn((x: number) => x * 2);
    const mFn = memoizeLast(fn);
    expect(mFn(5)).toBe(10);
    expect(mFn(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('memoizeLast re-computes on different args', () => {
    const fn = jest.fn((x: number) => x * 2);
    const mFn = memoizeLast(fn);
    mFn(1);
    mFn(2);
    mFn(1);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});