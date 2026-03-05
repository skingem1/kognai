import { RateLimitTracker } from '../src/rate-limit';

describe('RateLimitTracker', () => {
  it('starts with no rate limit info', () => {
    const tracker = new RateLimitTracker();
    expect(tracker.getInfo()).toBeNull();
    expect(tracker.shouldWait()).toBe(false);
    expect(tracker.getWaitMs()).toBe(0);
  });

  it('updates from response headers', () => {
    const tracker = new RateLimitTracker();
    tracker.update({
      'x-ratelimit-limit': '100',
      'x-ratelimit-remaining': '50',
      'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60),
    });
    const info = tracker.getInfo();
    expect(info).not.toBeNull();
    expect(info!.limit).toBe(100);
    expect(info!.remaining).toBe(50);
  });

  it('shouldWait returns false when remaining > 0', () => {
    const tracker = new RateLimitTracker();
    tracker.update({
      'x-ratelimit-limit': '100',
      'x-ratelimit-remaining': '50',
      'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60),
    });
    expect(tracker.shouldWait()).toBe(false);
  });

  it('shouldWait returns true when remaining is 0', () => {
    const tracker = new RateLimitTracker();
    tracker.update({
      'x-ratelimit-limit': '100',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60),
    });
    expect(tracker.shouldWait()).toBe(true);
    expect(tracker.getWaitMs()).toBeGreaterThan(0);
  });
});