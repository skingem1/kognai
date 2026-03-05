
/**
 * Supported blockchain protocol types
 */
export type ChainType = 'evm' | 'solana';

/**
 * Configuration for a supported blockchain network
 */
export interface ChainConfig {
  /** Unique identifier (e.g., 'base', 'polygon', 'solana') */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Blockchain protocol type */
  type: ChainType;
  /** Chain ID: number for EVM chains, 'solana' string for Solana */
  chainId: number | string;
  /** RPC endpoint URL for chain communication */
  rpcUrl: string;
  /** USDC token contract address on this chain */
  usdcAddress: string;
  /** Block explorer URL for transaction lookups */
  explorerUrl: string;
  /** Decimal places for USDC token (6 for both EVM and Solana) */
  usdcDecimals: number;
}

/** Record of all supported chain configurations */
export const CHAINS: Record<string, ChainConfig> = {
  base: {
    id: 'base',
    displayName: 'Base',
    type: 'evm',
    chainId: 8453,
    rpcUrl: process.env.BASE_RPC_URL || 'https://base.gateway.tenderly.co',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    explorerUrl: 'https://basescan.org',
    usdcDecimals: 6,
  },
  polygon: {
    id: 'polygon',
    displayName: 'Polygon',
    type: 'evm',
    chainId: 137,
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
    usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    explorerUrl: 'https://polygonscan.com',
    usdcDecimals: 6,
  },
  solana: {
    id: 'solana',
    displayName: 'Solana',
    type: 'solana',
    chainId: 'solana',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    usdcAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    explorerUrl: 'https://solscan.io',
    usdcDecimals: 6,
  },
};

/**
 * Retrieves the chain configuration for a given chain ID
 * @param chainId - The chain identifier (e.g., 'base', 'polygon', 'solana')
 * @returns The chain configuration object
 * @throws Error if the chain is not supported
 */
export function getChain(chainId: string): ChainConfig {
  const chain = CHAINS[chainId];
  if (!chain) {
    throw new Error(
      `Unsupported chain: ${chainId}. Supported: ${Object.keys(CHAINS).join(', ')}`
    );
  }
  return chain;
}

/**
 * Returns a list of all supported chain IDs
 * @returns Array of supported chain identifiers
 */
export function getSupportedChains(): string[] {
  return Object.keys(CHAINS);
}

/**
 * Checks if a chain is an EVM-compatible chain
 * @param chainId - The chain identifier to check
 * @returns True if the chain is EVM-compatible
 */
export function isEvmChain(chainId: string): boolean {
  return getChain(chainId).type === 'evm';
}

/**
 * Checks if a chain is Solana
 * @param chainId - The chain identifier to check
 * @returns True if the chain is Solana
 */
export function isSolanaChain(chainId: string): boolean {
  return getChain(chainId).type === 'solana';
}
