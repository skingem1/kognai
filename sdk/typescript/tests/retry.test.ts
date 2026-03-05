import { retryWithBackoff } from '../src/retry';

const makeError = (status: number) => {
  const e = new Error('fail') as any;
  e.status = status;
  return e;
};

describe('retryWithBackoff', () => {
  test('succeeds on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on retryable status 500', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(makeError(500))
      .mockRejectedValueOnce(makeError(500))
      .mockResolvedValue('ok');
    const result = await retryWithBackoff(fn, { maxRetries: 3, initialDelayMs: 1, maxDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('throws immediately on non-retryable status 403', async () => {
    const fn = jest.fn().mockRejectedValue(makeError(403));
    await expect(retryWithBackoff(fn)).rejects.toEqual(makeError(403));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('throws immediately when error has no status', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(retryWithBackoff(fn)).rejects.toEqual(new Error('fail'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('exhausts retries then throws', async () => {
    const fn = jest.fn().mockRejectedValue(makeError(500));
    await expect(retryWithBackoff(fn, { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 1 })).rejects.toEqual(makeError(500));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('respects custom retryableStatuses', async () => {
    const err418 = makeError(418);
    const fn = jest.fn().mockRejectedValueOnce(err418).mockResolvedValue('ok');
    const result = await retryWithBackoff(fn, { retryableStatuses: [418], maxRetries: 1, initialDelayMs: 1, maxDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('default maxRetries is 3', async () => {
    const fn = jest.fn().mockRejectedValue(makeError(500));
    await expect(retryWithBackoff(fn, { initialDelayMs: 1, maxDelayMs: 1 })).rejects.toEqual(makeError(500));
    expect(fn).toHaveBeenCalledTimes(4);
  });
});