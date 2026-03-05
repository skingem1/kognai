import { createTimer, sleep, measure } from '../timer';

describe('timer', () => {
  it('timer starts at 0 elapsed', () => {
    const t = createTimer();
    expect(t.elapsed()).toBe(0);
  });

  it('timer isRunning is false initially', () => {
    const t = createTimer();
    expect(t.isRunning()).toBe(false);
  });

  it('timer tracks elapsed time', async () => {
    const t = createTimer();
    t.start();
    await sleep(50);
    t.stop();
    expect(t.elapsed()).toBeGreaterThanOrEqual(40);
  });

  it('timer reset clears elapsed', async () => {
    const t = createTimer();
    t.start();
    await sleep(20);
    t.stop();
    t.reset();
    expect(t.elapsed()).toBe(0);
  });

  it('timer accumulates across start/stop', async () => {
    const t = createTimer();
    t.start();
    await sleep(30);
    t.stop();
    const e1 = t.elapsed();
    t.start();
    await sleep(30);
    t.stop();
    expect(t.elapsed()).toBeGreaterThan(e1);
  });

  it('sleep resolves after delay', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  it('measure returns result and duration', () => {
    const { result, duration } = measure(() => 42);
    expect(result).toBe(42);
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});