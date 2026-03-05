import { RateLimitTracker } from '../rate-limit';

describe('RateLimitTracker', () => {
  let tracker: RateLimitTracker;
  let now: number;

  beforeEach(() => {
    tracker = new RateLimitTracker();
    now = Date.now();
  });

  describe('getInfo', () => {
    it('returns null for new tracker', () => {
      expect(tracker.getInfo()).toBeNull();
    });

    it('returns parsed values after update', () => {
      const resetTime = Math.floor((now + 60000) / 1000);
      tracker.update({
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '50',
        'x-ratelimit-reset': String(resetTime),
      });
      const info = tracker.getInfo();
      expect(info).toEqual({
        limit: 100,
        remaining: 50,
        resetAt: new Date(resetTime * 1000),
      });
    });

    it('handles missing headers without crashing', () => {
      tracker.update({});
      expect(tracker.getInfo()).toBeNull();
    });

    it('multiple updates overwrite previous state', () => {
      const reset1 = Math.floor((now + 60000) / 1000);
      tracker.update({
        'x-ratelimit-limit': '10',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(reset1),
      });
      const reset2 = Math.floor((now + 120000) / 1000);
      tracker.update({
        'x-ratelimit-limit': '20',
        'x-ratelimit-remaining': '15',
        'x-ratelimit-reset': String(reset2),
      });
      const info = tracker.getInfo();
      expect(info?.limit).toBe(20);
      expect(info?.remaining).toBe(15);
    });
  });

  describe('shouldWait', () => {
    it('returns false when remaining > 0', () => {
      tracker.update({
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '50',
        'x-ratelimit-reset': '0',
      });
      expect(tracker.shouldWait()).toBe(false);
    });

    it('returns true when remaining is 0', () => {
      tracker.update({
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '0',
      });
      expect(tracker.shouldWait()).toBe(true);
    });
  });

  describe('getWaitMs', () => {
    it('returns positive ms when reset is in future', () => {
      const resetTime = Math.floor((now + 60000) / 1000);
      tracker.update({
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(resetTime),
      });
      const waitMs = tracker.getWaitMs();
      expect(waitMs).toBeGreaterThan(0);
      expect(waitMs).toBeLessThanOrEqual(60000);
    });

    it('returns 0 when reset is in past', () => {
      const resetTime = Math.floor((now - 10000) / 1000);
      tracker.update({
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(resetTime),
      });
      expect(tracker.getWaitMs()).toBe(0);
    });
  });

  describe('waitIfNeeded', () => {
    it('resolves immediately when no wait needed', () => {
      jest.useFakeTimers();
      tracker.update({
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '50',
        'x-ratelimit-reset': '0',
      });
      const promise = tracker.waitIfNeeded();
      jest.advanceTimersByTime(1000);
      jest.useRealTimers();
      return expect(promise).resolves.toBeUndefined();
    });

    it('waits until reset when shouldWait returns true', async () => {
      jest.useFakeTimers();
      const resetTime = Math.floor((now + 5000) / 1000);
      tracker.update({
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(resetTime),
      });
      const promise = tracker.waitIfNeeded();
      jest.advanceTimersByTime(5000);
      jest.useRealTimers();
      await expect(promise).resolves.toBeUndefined();
    });
  });
});