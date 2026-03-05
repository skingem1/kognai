import { pipe, compose, pipeline, applyIf } from '../pipe';

describe('pipe', () => {
  it('pipe applies functions left to right', () => {
    expect(pipe(5, (x: number) => x * 2, (x: number) => x + 1)).toBe(11);
  });

  it('pipe with no functions returns value', () => {
    expect(pipe(5)).toBe(5);
  });

  it('pipe with single function', () => {
    expect(pipe('hello', (s: string) => s.toUpperCase())).toBe('HELLO');
  });

  it('compose applies functions right to left', () => {
    const fn = compose<number>((x: number) => x + 1, (x: number) => x * 2);
    expect(fn(5)).toBe(11);
  });

  it('compose with single function', () => {
    const fn = compose<string>((s: string) => s.toUpperCase());
    expect(fn('hello')).toBe('HELLO');
  });

  it('pipeline creates reusable transform', () => {
    const transform = pipeline<number>((x: number) => x * 2, (x: number) => x + 10);
    expect(transform(5)).toBe(20);
    expect(transform(3)).toBe(16);
  });

  it('applyIf applies when true', () => {
    const fn = applyIf<number>(true, x => x * 2);
    expect(fn(5)).toBe(10);
  });

  it('applyIf returns value when false', () => {
    const fn = applyIf<number>(false, x => x * 2);
    expect(fn(5)).toBe(5);
  });
});