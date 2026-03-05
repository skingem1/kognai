import { throttle, debounce, rateLimit } from '../throttle';

describe('throttle', () => {
  let fn: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    fn = jest.fn();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  it('calls immediately on first invocation', () => {
    const t = throttle(fn, 100);
    t();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignores calls during cooldown', () => {
    const t = throttle(fn, 100);
    t(); t(); t();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls again after interval', () => {
    const t = throttle(fn, 100);
    t();
    jest.advanceTimersByTime(100);
    t();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cancels pending call', () => {
    const t = throttle(fn, 100);
    t();
    t.cancel();
    jest.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes arguments through', () => {
    const t = throttle(fn, 100);
    t('a', 'b');
    expect(fn).toHaveBeenCalledWith('a', 'b');
  });
});

describe('debounce', () => {
  let fn: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    fn = jest.fn();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  it('delays execution until after wait period', () => {
    const d = debounce(fn, 100);
    d();
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets timer on new call', () => {
    const d = debounce(fn, 100);
    d();
    jest.advanceTimersByTime(50);
    d();
    jest.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancels pending execution', () => {
    const d = debounce(fn, 100);
    d();
    d.cancel();
    jest.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush executes immediately', () => {
    const d = debounce(fn, 100);
    d();
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('rateLimit', () => {
  let fn: jest.Mock;

  beforeEach(() => {
    jest.useRealTimers();
    fn = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useFakeTimers();
    jest.restoreAllMocks();
  });

  it('allows calls within limit', async () => {
    const rl = rateLimit(fn, 3, 1000);
    await rl();
    await rl();
    await rl();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws when limit exceeded', async () => {
    const rl = rateLimit(fn, 2, 1000);
    await rl();
    await rl();
    await expect(rl()).rejects.toThrow('Rate limit exceeded');
  });
});