import { measureSync, measureAsync, createTimer, formatDuration } from '../measure';

describe('measure', () => {
  it('measureSync returns result and duration', () => {
    const { result, duration } = measureSync(() => 42);
    expect(result).toBe(42);
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('measureAsync returns result and duration', async () => {
    const { result, duration } = await measureAsync(async () => 'hello');
    expect(result).toBe('hello');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('measureAsync measures actual async work', async () => {
    const { duration } = await measureAsync(() => new Promise(r => setTimeout(r, 50)));
    expect(duration).toBeGreaterThanOrEqual(40);
  });

  it('createTimer measures elapsed time', () => {
    const timer = createTimer();
    const elapsed = timer.stop();
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('formatDuration formats ms', () => {
    expect(formatDuration(456)).toBe('456ms');
  });

  it('formatDuration formats seconds', () => {
    expect(formatDuration(1234)).toBe('1.23s');
  });

  it('formatDuration formats zero', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('formatDuration formats large', () => {
    expect(formatDuration(65000)).toBe('65.00s');
  });
});