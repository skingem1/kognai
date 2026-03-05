import { chains, tokens, getChainConfig } from './chains';
import type { ChainConfig, TokenConfig } from './chain-types';

describe('chains config', () => {
  describe('getChainConfig', () => {
    it('returns Polygon config for chainId 137', () => {
      const config = getChainConfig(137);
      expect(config?.name).toBe('Polygon');
      expect(config?.chainId).toBe(137);
      expect(config?.nativeCurrency.symbol).toBe('MATIC');
    });

    it('returns Ethereum config for chainId 1', () => {
      const config = getChainConfig(1);
      expect(config?.name).toBe('Ethereum');
      expect(config?.nativeCurrency.symbol).toBe('ETH');
    });

    it('returns undefined for unknown chainId', () => {
      expect(getChainConfig(9999)).toBeUndefined();
    });
  });

  describe('chains Map', () => {
    it('contains both Ethereum and Polygon', () => {
      expect(chains.size).toBe(2);
      expect(chains.has(1)).toBe(true);
      expect(chains.has(137)).toBe(true);
    });
  });

  describe('tokens Map', () => {
    it('contains USDC on Polygon', () => {
      const polygonTokens = tokens.get(137);
      expect(polygonTokens?.length).toBe(1);
      expect(polygonTokens?.[0].symbol).toBe('USDC');
      expect(polygonTokens?.[0].address).toBe('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
    });
  });
});