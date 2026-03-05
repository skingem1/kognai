import { debounce, throttle } from '../debounce';

describe('debounce and throttle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('debounce delays execution', () => {
    const fn = jest.fn();
    const d = debounce(fn, 100);
    d();
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('debounce resets timer on repeated calls', () => {
    const fn = jest.fn();
    const d = debounce(fn, 100);
    d();
    jest.advanceTimersByTime(50);
    d();
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('debounce cancel prevents execution', () => {
    const fn = jest.fn();
    const d = debounce(fn, 100);
    d();
    d.cancel();
    jest.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it('debounce passes arguments', () => {
    const fn = jest.fn();
    const d = debounce(fn, 50);
    d('a', 'b');
    jest.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith('a', 'b');
  });

  it('throttle executes immediately on first call', () => {
    const fn = jest.fn();
    const t = throttle(fn, 100);
    t();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throttle blocks calls within limit', () => {
    const fn = jest.fn();
    const t = throttle(fn, 100);
    t();
    t();
    t();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throttle allows call after limit', () => {
    const fn = jest.fn();
    const t = throttle(fn, 100);
    t();
    jest.advanceTimersByTime(100);
    t();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});