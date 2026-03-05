import { TimeoutError, withTimeout, createAbortSignal } from '../src/timeout';

describe('TimeoutError', () => {
  it('should have correct message, name, timeoutMs, and be an Error', () => {
    const error = new TimeoutError(5000);
    expect(error.message).toBe('Request timed out after 5000ms');
    expect(error.name).toBe('TimeoutError');
    expect(error.timeoutMs).toBe(5000);
    expect(error instanceof Error).toBe(true);
  });
});

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('should resolve when promise resolves before timeout', async () => {
    jest.useRealTimers();
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('should reject with TimeoutError when promise is slow', async () => {
    const neverResolve = new Promise(() => {});
    const promise = withTimeout(neverResolve, 500);
    jest.advanceTimersByTime(500);
    await expect(promise).rejects.toThrow('Request timed out after 500ms');
  });

  it('should reject with original error when promise rejects before timeout', async () => {
    jest.useRealTimers();
    await expect(withTimeout(Promise.reject(new Error('fail')), 1000)).rejects.toThrow('fail');
  });
});

describe('createAbortSignal', () => {
  it('should return an AbortSignal that is not aborted initially', () => {
    const signal = createAbortSignal(5000);
    expect(signal instanceof AbortSignal).toBe(true);
    expect(signal.aborted).toBe(false);
  });
});