import {debounce, throttle, once, preventDefaults, isKeyboardEvent} from '../event-utils';

describe('event-utils', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  describe('debounce', () => {
    it('delays execution', () => {
      const fn = jest.fn();
      const d = debounce(fn, 100);
      d();
      expect(fn).not.toHaveBeenCalled();
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('resets timer on subsequent calls', () => {
      const fn = jest.fn();
      const d = debounce(fn, 100);
      d(); d(); d();
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('cancel prevents execution', () => {
      const fn = jest.fn();
      const d = debounce(fn, 100);
      d(); d.cancel();
      jest.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('throttle', () => {
    it('executes immediately on first call', () => {
      const fn = jest.fn();
      const t = throttle(fn, 100);
      t();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('blocks calls within limit', () => {
      const fn = jest.fn();
      const t = throttle(fn, 100);
      t(); t(); t();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('allows call after limit', () => {
      const fn = jest.fn();
      const t = throttle(fn, 100);
      t(); jest.advanceTimersByTime(101); t();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('once', () => {
    it('calls fn on first invocation and returns cached result', () => {
      const fn = jest.fn().mockReturnValue(42);
      const o = once(fn);
      expect(o()).toBe(42);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(o()).toBe(42);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('preventDefaults', () => {
    it('calls both preventDefault and stopPropagation', () => {
      const e = {preventDefault: jest.fn(), stopPropagation: jest.fn()};
      preventDefaults(e);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(e.stopPropagation).toHaveBeenCalled();
    });
  });

  describe('isKeyboardEvent', () => {
    it('returns true for matching key', () => {
      expect(isKeyboardEvent('Enter')({key: 'Enter'})).toBe(true);
    });

    it('returns false for non-matching key', () => {
      expect(isKeyboardEvent('Enter')({key: 'Escape'})).toBe(false);
    });
  });
});