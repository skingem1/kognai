import { ChainConfig, NativeCurrency, TokenConfig } from './chain-types';

describe('ChainConfig Interface', () => {
  it('should create a valid Ethereum chain config', () => {
    const ethConfig: ChainConfig = {
      chainId: 1,
      name: 'Ethereum',
      rpcUrls: ['https://eth-mainnet.alchemyapi.io'],
      blockExplorerUrl: 'https://etherscan.io',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    };

    expect(ethConfig.chainId).toBe(1);
    expect(ethConfig.name).toBe('Ethereum');
    expect(ethConfig.rpcUrls).toHaveLength(1);
    expect(ethConfig.nativeCurrency.symbol).toBe('ETH');
  });

  it('should create a valid Polygon chain config', () => {
    const polygonConfig: ChainConfig = {
      chainId: 137,
      name: 'Polygon',
      rpcUrls: ['https://polygon-rpc.com'],
      blockExplorerUrl: 'https://polygonscan.com',
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    };

    expect(polygonConfig.chainId).toBe(137);
    expect(polygonConfig.nativeCurrency.decimals).toBe(18);
  });
});

describe('TokenConfig Interface', () => {
  it('should create a valid token config', () => {
    const token: TokenConfig = {
      address: '0x1234567890123456789012345678901234567890',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      chainId: 1,
    };

    expect(token.address).toBeDefined();
    expect(token.symbol).toBe('USDC');
    expect(token.chainId).toBe(1);
  });
});

describe('NativeCurrency Interface', () => {
  it('should handle zero decimals', () => {
    const native: NativeCurrency = {
      name: 'Bitcoin',
      symbol: 'BTC',
      decimals: 0,
    };

    expect(native.decimals).toBe(0);
  });
});