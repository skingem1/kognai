/**
 * Central type definitions for the backend application
 * @packageDocumentation
 */

/**
 * Configuration for a supported blockchain network
 */
export interface ChainConfig {
  /** Numeric chain ID (e.g., 8453 for Base) */
  id: number;
  /** Human-readable chain name */
  name: string;
  /** RPC endpoint URL for chain communication */
  rpcUrl: string;
  /** USDC token contract address on this chain */
  usdcAddress: string;
  /** Block explorer base URL */
  explorerUrl: string;
  /** Whether this is a testnet */
  isTestnet: boolean;
}
