import { z } from 'zod';

/**
 * X-Payment-Token header validation schema
 * Supports both Ethereum (mainnet) and Polygon (chainId 137)
 */
export const XPaymentTokenSchema = z.string().regex(
  /^0x[a-fA-F0-9]{40}$/,
  'Invalid payment token format: must be a valid Ethereum address'
);

/**
 * X-Payment-Amount header validation schema
 */
export const XPaymentAmountSchema = z.string().regex(
  /^\d+$/,
  'Invalid payment amount format: must be a positive integer string'
);

/**
 * X-Payment-ChainId header validation schema
 * Supports Ethereum mainnet (1) and Polygon (137)
 */
export const XPaymentChainIdSchema = z.coerce.number().int().positive().refine(
  (val) => val === 1 || val === 137,
  'Invalid chainId: must be 1 (Ethereum) or 137 (Polygon)'
);

/**
 * X-Payment-Contract header validation schema (optional)
 */
export const XPaymentContractSchema = z.string().regex(
  /^0x[a-fA-F0-9]{40}$/,
  'Invalid contract address format'
).optional();

/**
 * Combined schema for all X-Payment headers
 */
export const XPaymentHeadersSchema = z.object({
  'x-payment-token': XPaymentTokenSchema,
  'x-payment-amount': XPaymentAmountSchema,
  'x-payment-chainid': XPaymentChainIdSchema,
  'x-payment-contract': XPaymentContractSchema,
});

/**
 * Token configuration for a specific chain
 */
export interface TokenConfig {
  address: string;
  decimals: number;
  symbol: string;
}

/**
 * Chain configuration
 */
export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  usdc: TokenConfig;
}

/**
 * Known chain configurations
 */
export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: process.env.ETHEREUM_RPC_URL || '',
    usdc: {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
      symbol: 'USDC',
    },
  },
  137: {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: process.env.POLYGON_RPC_URL || '',
    usdc: {
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      decimals: 6,
      symbol: 'USDC',
    },
  },
};

/**
 * Get chain configuration by chainId
 * @param chainId - The chain ID (1 for Ethereum, 137 for Polygon)
 * @returns ChainConfig for the specified chain
 * @throws Error if chainId is not supported
 */
export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(`Unsupported chainId: ${chainId}. Supported: 1 (Ethereum), 137 (Polygon)`);
  }
  return config;
}

/**
 * Get USDC token configuration for a specific chain
 * @param chainId - The chain ID (1 for Ethereum, 137 for Polygon)
 * @returns TokenConfig for USDC on the specified chain
 */
export function getUsdcConfig(chainId: number): TokenConfig {
  return getChainConfig(chainId).usdc;
}

/**
 * Parse and validate X-Payment headers from request
 * @param headers - Record of request headers
 * @returns Parsed and validated payment headers
 */
export function parsePaymentHeaders(headers: Record<string, string | undefined>) {
  return XPaymentHeadersSchema.parse({
    'x-payment-token': headers['x-payment-token'],
    'x-payment-amount': headers['x-payment-amount'],
    'x-payment-chainid': headers['x-payment-chainid'],
    'x-payment-contract': headers['x-payment-contract'],
  });
}

/**
 * Type for parsed payment headers
 */
export type PaymentHeaders = z.infer<typeof XPaymentHeadersSchema>;

/**
 * Supported chain IDs
 */
export const SUPPORTED_CHAIN_IDS = [1, 137] as const;
export type SupportedChainId = typeof SUPPORTED_CHAIN_IDS[number];

/**
 * Check if a chainId is supported
 * @param chainId - The chain ID to check
 * @returns true if the chain is supported
 */
export function isSupportedChain(chainId: number): chainId is SupportedChainId {
  return SUPPORTED_CHAIN_IDS.includes(chainId as SupportedChainId);
}