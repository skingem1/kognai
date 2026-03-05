import { AsyncQueue } from '../queue';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('AsyncQueue', () => {
  it('executes tasks in order', async () => {
    const q = new AsyncQueue();
    const results: number[] = [];
    await q.add(async () => { results.push(1); });
    await q.add(async () => { results.push(2); });
    expect(results).toEqual([1, 2]);
  });

  it('respects concurrency limit', async () => {
    const q = new AsyncQueue(1);
    let concurrent = 0, maxConcurrent = 0;
    const task = async () => { concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent); await delay(50); concurrent--; };
    await Promise.all([q.add(task), q.add(task), q.add(task)]);
    expect(maxConcurrent).toBe(1);
  });

  it('allows parallel with concurrency > 1', async () => {
    const q = new AsyncQueue(2);
    let concurrent = 0, maxConcurrent = 0;
    const task = async () => { concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent); await delay(50); concurrent--; };
    await Promise.all([q.add(task), q.add(task), q.add(task)]);
    expect(maxConcurrent).toBe(2);
  });

  it('returns task result', async () => {
    const q = new AsyncQueue();
    const result = await q.add(async () => 42);
    expect(result).toBe(42);
  });

  it('propagates errors', async () => {
    const q = new AsyncQueue();
    await expect(q.add(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
  });

  it('pending returns queue length', async () => {
    const q = new AsyncQueue(1);
    q.add(() => delay(100));
    q.add(() => delay(100));
    await delay(10);
    expect(q.pending).toBeGreaterThanOrEqual(1);
  });

  it('active returns running count', async () => {
    const q = new AsyncQueue(2);
    q.add(() => delay(100));
    q.add(() => delay(100));
    await delay(10);
    expect(q.active).toBe(2);
  });
});