import { TimeoutError, withTimeout, createAbortSignal } from '../timeout';

describe('TimeoutError', () => {
  it('should set correct message, name and timeoutMs property', () => {
    const error = new TimeoutError(5000);
    expect(error.message).toBe('Request timed out after 5000ms');
    expect(error.name).toBe('TimeoutError');
    expect(error.timeoutMs).toBe(5000);
  });
});

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves value before timeout', async () => {
    const result = await withTimeout(Promise.resolve('success'), 1000);
    expect(result).toBe('success');
  });

  it('rejects with TimeoutError when promise times out', async () => {
    const neverResolves = new Promise(() => {});
    const promise = withTimeout(neverResolves, 100);
    await jest.advanceTimersByTimeAsync(100);
    await expect(promise).rejects.toThrow(TimeoutError);
  });

  it('passes through original error when promise rejects', async () => {
    const originalError = new Error('Original');
    await expect(withTimeout(Promise.reject(originalError), 1000)).rejects.toBe(originalError);
  });
});

describe('createAbortSignal', () => {
  it('returns AbortSignal instance', () => {
    const signal = createAbortSignal(5000);
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});