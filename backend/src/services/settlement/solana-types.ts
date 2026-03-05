import { SettlementMatch } from './evm-detector';

/**
 * Solana base58-encoded public key type (32 bytes)
 */
export type SolanaAddress = string;

/**
 * USDC Mint Address on Solana (Serum USDC)
 */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as const;

/**
 * SPL Token Program ID
 */
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as const;

/**
 * Memo Program ID
 */
export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' as const;

/**
 * Solana settlement detection result
 * Extends SettlementMatch for compatibility with existing settlement infrastructure
 */
export interface SolanaSettlement extends Omit<SettlementMatch, 'txHash' | 'blockNumber' | 'from' | 'to' | 'amount'> {
  /** Transaction signature (base58-encoded) */
  txSignature: string;
  /** Sender's wallet address (base58-encoded) */
  fromAddress: SolanaAddress;
  /** Recipient's wallet address (base58-encoded) */
  toAddress: SolanaAddress;
  /** Transfer amount in lamports or USDC smallest units */
  amount: bigint;
  /** Optional memo/notes attached to the transaction */
  memo?: string;
  /** Unix timestamp of the transaction */
  timestamp: number;
  /** Number of confirmations received */
  confirmations: number;
}

/**
 * Request parameters for fetching transfers for a wallet
 */
export interface SolanaTransferRequest {
  /** Wallet address to fetch transfers for */
  walletAddress: SolanaAddress;
  /** Maximum number of signatures to return (default: 20) */
  limit?: number;
}

/**
 * Request parameters for verifying a settlement
 */
export interface SolanaVerifyRequest {
  /** Transaction signature to verify */
  txSignature: string;
  /** Expected recipient address */
  expectedRecipient: SolanaAddress;
  /** Expected amount in USDC (smallest units) */
  expectedAmountUsdc: bigint;
}

/**
 * Parsed transaction data from getTransaction RPC response
 */
export interface SolanaTxParsed {
  /** Transaction signature */
  signature: string;
  /** Slot number */
  slot: number;
  /** Transaction timestamp (unix) */
  blockTime?: number;
  /** Number of confirmations */
  confirmations?: number;
  /** Parsed instructions */
  instructions: SolanaInstruction[];
  /** Token transfers (if SPL transfer) */
  tokenTransfers?: SolanaTokenTransfer[];
  /** Memo text (if memo instruction present) */
  memo?: string;
  /** Error if transaction failed */
  err?: string;
}

/**
 * Parsed instruction within a transaction
 */
export interface SolanaInstruction {
  /** Program ID invoked */
  programId: SolanaAddress;
  /** Account keys referenced */
  accounts: SolanaAddress[];
  /** Instruction data (base58-encoded) */
  data: string;
}

/** SPL Token transfer details */
export interface SolanaTokenTransfer {
  /** Token mint address */
  mint: SolanaAddress;
  /** Source token account */
  source: SolanaAddress;
  /** Destination token account */
  destination: SolanaAddress;
  /** Transfer amount (smallest units) */
  amount: bigint;
  /** Decimals for the token */
  decimals: number;
}

/**
 * Signature info from getSignaturesForAddress RPC
 */
export interface SolanaSignatureInfo {
  /** Transaction signature */
  signature: string;
  /** Slot containing the transaction */
  slot: number;
  /** Optional error information */
  err?: string;
  /** Optional memo (if parsed) */
  memo?: string;
  /** Block time (unix timestamp) */
  blockTime?: number;
  /** Confirmation status */
  confirmationStatus: 'processed' | 'confirmed' | 'finalized';
}