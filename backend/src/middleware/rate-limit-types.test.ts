import { RateLimitTier, TierName, RATE_LIMIT_TIERS } from './rate-limit-types';

describe('Rate Limit Types', () => {
  describe('RateLimitTier interface', () => {
    it('should accept valid tier configuration', () => {
      const tier: RateLimitTier = {
        requests: 100,
        window: '1h'
      };

      expect(tier.requests).toBe(100);
      expect(tier.window).toBe('1h');
    });
  });

  describe('TierName type', () => {
    it('should accept valid tier names', () => {
      const freeTier: TierName = 'free';
      const paidTier: TierName = 'paid';

      expect(freeTier).toBe('free');
      expect(paidTier).toBe('paid');
    });
  });

  describe('RATE_LIMIT_TIERS constant', () => {
    it('should have correct free tier configuration', () => {
      expect(RATE_LIMIT_TIERS.free).toEqual({
        requests: 100,
        window: '1h'
      });
    });

    it('should have correct paid tier configuration', () => {
      expect(RATE_LIMIT_TIERS.paid).toEqual({
        requests: 1000,
        window: '1h'
      });
    });

    it('should contain all tier names', () => {
      const tierNames = Object.keys(RATE_LIMIT_TIERS) as TierName[];
      expect(tierNames).toEqual(['free', 'paid']);
    });

    it('should be immutable constant', () => {
      expect(() => {
        // @ts-expect-error Testing immutability
        RATE_LIMIT_TIERS.free = { requests: 200, window: '2h' };
      }).toThrow();
    });
  });
});