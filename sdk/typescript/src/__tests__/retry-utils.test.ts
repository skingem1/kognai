import { retry } from '../retry-utils';

describe('retry-utils', () => {
  it('resolves on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await retry(fn, { delay: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');
    const result = await retry(fn, { delay: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max attempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(retry(fn, { maxAttempts: 2, delay: 10 })).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('calls onRetry callback', async () => {
    const onRetry = jest.fn();
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('e'))
      .mockResolvedValue('ok');
    await retry(fn, { delay: 10, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses default maxAttempts of 3', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('e'));
    await expect(retry(fn, { delay: 10 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });
});