import { sleep, timeout, retry, allSettledWithErrors, promisePool } from '../promise-utils';

describe('promise-utils', () => {
  beforeEach(() => jest.useFakeTimers());

  describe('sleep', () => {
    it('resolves after delay', async () => {
      const p = sleep(100);
      jest.advanceTimersByTime(100);
      await expect(p).resolves.toBeUndefined();
    });
  });

  describe('timeout', () => {
    it('resolves if promise is fast', async () => {
      jest.useRealTimers();
      await expect(timeout(Promise.resolve(42), 1000)).resolves.toBe(42);
    });

    it('rejects if promise is slow', async () => {
      const p = timeout(new Promise(() => {}), 1000);
      jest.advanceTimersByTime(1001);
      await expect(p).rejects.toThrow('Timeout');
    });

    it('uses custom message', async () => {
      const p = timeout(new Promise(() => {}), 1000, 'Custom');
      jest.advanceTimersByTime(1001);
      await expect(p).rejects.toThrow('Custom');
    });
  });

  describe('retry', () => {
    beforeEach(() => jest.useRealTimers());

    it('succeeds on first try', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      await expect(retry(fn)).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('succeeds on third try', async () => {
      const fn = jest.fn().mockRejectedValueOnce(1).mockRejectedValueOnce(2).mockResolvedValue('ok');
      await expect(retry(fn, { attempts: 3 })).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      await expect(retry(fn, { attempts: 3 })).rejects.toThrow('fail');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('calls onError with error and attempt number', async () => {
      const onError = jest.fn();
      const fn = jest.fn().mockRejectedValue(new Error('err'));
      await expect(retry(fn, { attempts: 3, onError })).rejects.toThrow();
      expect(onError).toHaveBeenCalledTimes(3);
      expect(onError).toHaveBeenNthCalledWith(1, expect.any(Error), 1);
      expect(onError).toHaveBeenNthCalledWith(2, expect.any(Error), 2);
      expect(onError).toHaveBeenNthCalledWith(3, expect.any(Error), 3);
    });
  });

  describe('allSettledWithErrors', () => {
    beforeEach(() => jest.useRealTimers());

    it('all fulfilled', async () => {
      const results = await allSettledWithErrors([Promise.resolve(1), Promise.resolve(2)]);
      expect(results.fulfilled).toEqual([1, 2]);
      expect(results.rejected).toEqual([]);
    });

    it('mixed', async () => {
      const results = await allSettledWithErrors([Promise.resolve(1), Promise.reject('fail')]);
      expect(results.fulfilled).toEqual([1]);
      expect(results.rejected).toHaveLength(1);
    });

    it('all rejected', async () => {
      const results = await allSettledWithErrors([Promise.reject('a'), Promise.reject('b')]);
      expect(results.fulfilled).toEqual([]);
      expect(results.rejected).toHaveLength(2);
    });
  });

  describe('promisePool', () => {
    beforeEach(() => jest.useRealTimers());

    it('executes all tasks', async () => {
      const tasks = [() => Promise.resolve(1), () => Promise.resolve(2), () => Promise.resolve(3)];
      const results = await promisePool(tasks, 2);
      expect(results).toEqual([1, 2, 3]);
    });

    it('respects concurrency limit', async () => {
      let running = 0, max = 0;
      const tasks = Array.from({ length: 5 }, (_, i) => async () => {
        running++; max = Math.max(max, running);
        await Promise.resolve(i);
        running--;
        return i;
      });
      await promisePool(tasks, 2);
      expect(max).toBeLessThanOrEqual(2);
    });
  });
});