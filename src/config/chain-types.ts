/**
 * Native currency configuration for a blockchain network
 */
export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

/**
 * Configuration for a blockchain network
 */
export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrls: string[];
  blockExplorerUrl: string;
  nativeCurrency: NativeCurrency;
}

/**
 * Configuration for a token on a blockchain network
 */
export interface TokenConfig {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  chainId: number;
}