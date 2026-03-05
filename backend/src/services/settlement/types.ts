/**
 * EVM Settlement Detection Types
 * 
 * Types for detecting and matching settlements from EVM chains to invoices.
 */

import { ChainConfig } from '../chain-registry/types';

/**
 * Represents a matched settlement from an EVM chain
 */
export interface SettlementMatch {
  /** Unique identifier of the invoice this settlement is for */
  invoiceId: string;
  /** EVM transaction hash of the settlement */
  txHash: string;
  /** Settlement amount in human-readable USDC (e.g., 100.50 = $100.50 USDC) */
  amount: number;
  /** Payer's EVM address (EOA or contract) */
  from: string;
  /** Recipient's EVM address (typically a merchant wallet or settlement contract) */
  to: string;
  /** Block number where the transaction was included */
  blockNumber: number;
  /** Unix timestamp in seconds when the block was mined */
  timestamp: number;
  /** Chain identifier (e.g., 'ethereum', 'polygon', 'arbitrum') */
  chain: string;
}

/**
 * Filter criteria for querying settlements from a chain
 */
export interface SettlementFilter {
  /** Minimum block number to search from */
  fromBlock: number;
  /** Maximum block number to search to */
  toBlock: number;
  /** Recipient address to filter by (optional) */
  to?: string;
  /** Payer address to filter by (optional) */
  from?: string;
  /** Minimum amount in human-readable USDC */
  minAmount?: number;
  /** Maximum amount in human-readable USDC */
  maxAmount?: number;
}

/**
 * Result of a settlement query from a chain
 */
export interface SettlementQueryResult {
  /** Array of raw settlement data from the chain */
  settlements: RawSettlement[];
  /** The last block that was queried (for pagination) */
  lastQueriedBlock: number;
  /** Whether there are more results to fetch */
  hasMore: boolean;
}

/**
 * Raw settlement data as received from the blockchain
 */
export interface RawSettlement {
  txHash: string;
  blockNumber: number;
  blockTimestamp: number;
  from: string;
  to: string;
  amount: string; // Raw token amount (smallest unit)
  tokenAddress: string;
  chain: string;
  confirmations: number;
}

/**
 * Configuration for settlement detection on a specific chain
 */
export interface SettlementDetectionConfig {
  /** Chain configuration */
  chain: ChainConfig;
  /** Polling interval in milliseconds */
  pollingIntervalMs: number;
  /** Number of block confirmations required before considering a settlement final */
  requiredConfirmations: number;
  /** USDC token address on this chain */
  usdcTokenAddress: string;
  /** Settlement contract address (if different from merchant wallet) */
  settlementContractAddress?: string;
}

/**
 * Status of settlement detection for an invoice
 */
export enum SettlementStatus {
  /** No settlement detected yet */
  Pending = 'pending',
  /** Settlement detected, waiting for confirmations */
  Processing = 'processing',
  /** Settlement confirmed and matched */
  Settled = 'settled',
  /** Settlement failed or reverted */
  Failed = 'failed',
}

/**
 * Event emitted when a settlement is detected
 */
export interface SettlementDetectedEvent {
  invoiceId: string;
  match: SettlementMatch;
  status: SettlementStatus;
  detectedAt: number;
}

/**
 * Re-export ChainConfig for use in detector implementation
 */
export type { ChainConfig } from '../chain-registry/types';