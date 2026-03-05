import { createBatches, processBatches, processWithConcurrency, groupBy, chunk } from '../batch-processor';

jest.useRealTimers();

describe('batch-processor', () => {
  describe('createBatches', () => {
    it('splits evenly', () => {
      expect(createBatches([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
    });

    it('handles uneven last batch', () => {
      expect(createBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('returns empty for empty array', () => {
      expect(createBatches([], 3)).toEqual([]);
    });

    it('handles batch size larger than array', () => {
      expect(createBatches([1, 2], 5)).toEqual([[1, 2]]);
    });

    it('throws on invalid size', () => {
      expect(() => createBatches([1], 0)).toThrow();
    });
  });

  describe('processBatches', () => {
    it('processes all items with order preserved', async () => {
      const results = await processBatches([1, 2, 3, 4, 5, 6], 2, (x: number) => Promise.resolve(x * 2));
      expect(results).toEqual([2, 4, 6, 8, 10, 12]);
    });

    it('returns empty for empty input', async () => {
      const results = await processBatches([], 2, (x: number) => Promise.resolve(x * 2));
      expect(results).toEqual([]);
    });
  });

  describe('processWithConcurrency', () => {
    it('processes all items respecting concurrency limit', async () => {
      let maxConcurrent = 0, current = 0;
      const results = await processWithConcurrency(
        [1, 2, 3, 4, 5],
        2,
        async (x: number) => {
          current++;
          maxConcurrent = Math.max(maxConcurrent, current);
          await new Promise(r => setTimeout(r, 10));
          current--;
          return x * 2;
        }
      );
      expect(results).toEqual([2, 4, 6, 8, 10]);
      expect(maxConcurrent).toBeLessOrEqual(2);
    });
  });

  describe('groupBy', () => {
    it('groups items by key', () => {
      const items = [{ t: 'a', v: 1 }, { t: 'b', v: 2 }, { t: 'a', v: 3 }];
      const grouped = groupBy(items, (i: { t: string }) => i.t);
      expect(grouped).toEqual({ a: [{ t: 'a', v: 1 }, { t: 'a', v: 3 }], b: [{ t: 'b', v: 2 }] });
    });

    it('returns empty object for empty array', () => {
      expect(groupBy([], (x: number) => String(x))).toEqual({});
    });
  });

  describe('chunk', () => {
    it('delegates to createBatches', () => {
      expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    });
  });
});