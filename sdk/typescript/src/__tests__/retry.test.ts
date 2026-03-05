import { retryWithBackoff } from '../retry';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable status error and succeeds on retry', async () => {
    const error = Object.assign(new Error('fail'), { status: 500 });
    const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');
    
    const promise = retryWithBackoff(fn);
    
    await jest.advanceTimersByTimeAsync(200); // initial delay
    await jest.advanceTimersByTimeAsync(200); // exponential backoff
    
    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on non-retryable status', async () => {
    const error = Object.assign(new Error('forbidden'), { status: 403 });
    const fn = jest.fn().mockRejectedValue(error);
    
    await expect(retryWithBackoff(fn)).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after maxRetries exhausted', async () => {
    const error = Object.assign(new Error('server error'), { status: 500 });
    const fn = jest.fn().mockRejectedValue(error);
    
    const promise = retryWithBackoff(fn);
    
    // Exhaust retries: 200 + 400 + 800 = 1400ms
    await jest.advanceTimersByTimeAsync(200);
    await jest.advanceTimersByTimeAsync(400);
    await jest.advanceTimersByTimeAsync(800);
    
    await expect(promise).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('respects custom maxRetries option', async () => {
    const error = Object.assign(new Error('server error'), { status: 500 });
    const fn = jest.fn().mockRejectedValue(error);
    
    const promise = retryWithBackoff(fn, { maxRetries: 1 });
    
    await jest.advanceTimersByTimeAsync(200);
    
    await expect(promise).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  it('throws immediately if error has no status property', async () => {
    const error = new Error('unknown error');
    const fn = jest.fn().mockRejectedValue(error);
    
    await expect(retryWithBackoff(fn)).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses default options when none provided', async () => {
    const error = Object.assign(new Error('server error'), { status: 500 });
    const fn = jest.fn().mockRejectedValue(error);
    
    const promise = retryWithBackoff(fn);
    
    // Default maxRetries=3, so 4 calls total
    await jest.advanceTimersByTimeAsync(200);
    await jest.advanceTimersByTimeAsync(400);
    await jest.advanceTimersByTimeAsync(800);
    
    await expect(promise).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(4);
  });
});