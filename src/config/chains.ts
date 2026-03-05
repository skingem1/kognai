import type { ChainConfig, TokenConfig } from './chain-types';

/**
 * Ethereum Mainnet Configuration
 * Chain ID: 1
 * Used for backward compatibility
 */
const ethereumMainnet: ChainConfig = {
  chainId: 1,
  name: 'Ethereum',
  rpcUrls: ['https://eth-mainnet.g.alchemy.com/v2/demo', 'https://ethereum-rpc.publicnode.com'],
  blockExplorerUrl: 'https://etherscan.io',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
};

/**
 * Polygon Mainnet Configuration
 * Chain ID: 137
 */
const polygonMainnet: ChainConfig = {
  chainId: 137,
  name: 'Polygon',
  rpcUrls: ['https://polygon-rpc.com'],
  blockExplorerUrl: 'https://polygonscan.com',
  nativeCurrency: {
    name: 'MATIC',
    symbol: 'MATIC',
    decimals: 18,
  },
};

/**
 * USDC Token on Polygon
 * Chain ID: 137
 */
const usdcPolygon: TokenConfig = {
  address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  name: 'USD Coin',
  symbol: 'USDC',
  decimals: 6,
  chainId: 137,
};

/**
 * Registry of all supported chains keyed by chainId
 */
export const chains: Map<number, ChainConfig> = new Map([
  [ethereumMainnet.chainId, ethereumMainnet],
  [polygonMainnet.chainId, polygonMainnet],
]);

/**
 * Registry of all supported tokens keyed by chainId
 * Note: This is a simple implementation. For production, consider
 * using a more sophisticated token registry or multi-key Map
 */
export const tokens: Map<number, TokenConfig[]> = new Map([
  [usdcPolygon.chainId, [usdcPolygon]],
]);

/**
 * Retrieves chain configuration by chain ID
 * @param chainId - The blockchain network chain ID
 * @returns ChainConfig object if found, undefined otherwise
 * @example
 * const config = getChainConfig(137);
 * if (config) {
 *   console.log(config.name); // 'Polygon'
 * }
 */
export function getChainConfig(chainId: number): ChainConfig | undefined {
  return chains.get(chainId);
}

/**
 * Retrieves token configuration(s) by chain ID
 * @param chainId - The blockchain network chain ID
 * @returns Array of TokenConfig objects if found, empty array otherwise
 * @example
 * const tokens = getTokenConfigs(137);
 * const usdc = tokens.find(t => t.symbol === 'USDC');
 */
export function getTokenConfigs(chainId: number): TokenConfig[] {
  return tokens.get(chainId) ?? [];
}

/**
 * Retrieves a specific token by chain ID and token symbol
 * @param chainId - The blockchain network chain ID
 * @param symbol - The token symbol (e.g., 'USDC', 'USDT')
 * @returns TokenConfig object if found, undefined otherwise
 * @example
 * const usdc = getTokenBySymbol(137, 'USDC');
 */
export function getTokenBySymbol(chainId: number, symbol: string): TokenConfig | undefined {
  const chainTokens = tokens.get(chainId) ?? [];
  return chainTokens.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
}

/**
 * Type guard to check if a chain is supported
 * @param chainId - The blockchain network chain ID
 * @returns true if chain is supported, false otherwise
 * @example
 * if (isChainSupported(137)) {
 *   // Polygon is supported
 * }
 */
export function isChainSupported(chainId: number): boolean {
  return chains.has(chainId);
}