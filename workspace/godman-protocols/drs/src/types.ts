/**
 * DRS — Deal Receipt Standard
 * Core type definitions
 *
 * Every deal needs a receipt. DRS is that receipt.
 * On-chain receipt protocol for agent-to-agent transactions.
 *
 * @version 0.3.0
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Decentralised Identifier (e.g. "did:kognai:harvey") */
export type DID = string;

/** SHA-256 hex string */
export type SHA256Hash = string;

/** ISO-8601 timestamp */
export type Timestamp = string;

/** Ethereum-style transaction hash */
export type TxHash = string;

/** EAS attestation UID */
export type AttestationUID = string;

// ---------------------------------------------------------------------------
// AgentTax integration (optional tax_line)
// ---------------------------------------------------------------------------

/**
 * Tax line item attached to a deal receipt.
 * Mirrors the AgentTax x402 pay-per-call tax structure.
 */
export interface TaxLine {
  /** Jurisdiction code (e.g. "US-CA", "EU-DE") */
  jurisdiction: string;
  /** Tax rate as a decimal (e.g. 0.0725 for 7.25%) */
  rate: number;
  /** Tax amount in the receipt's currency */
  amount: string;
  /** Tax type (e.g. "sales_tax", "vat", "gst") */
  type: string;
}

// ---------------------------------------------------------------------------
// DealReceipt — the core schema
// ---------------------------------------------------------------------------

/**
 * On-chain receipt for an agent-to-agent transaction.
 *
 * Created when agents transact via x402. Minted on Base as an EAS attestation.
 * Links a PACT negotiation session to its x402 settlement.
 */
export interface DealReceipt {
  /** SHA-256 hash of the PACT negotiation deal object */
  deal_hash: SHA256Hash;

  /** PACT session identifier that produced this deal */
  pact_session_id: string;

  /** DID of the agent that requested the capability */
  requester_did: DID;

  /** DID of the agent that provided the capability */
  provider_did: DID;

  /** Identifier of the capability transacted (from LAX offer) */
  capability_id: string;

  /** Payment amount as a string (to preserve precision) */
  payment_amount: string;

  /** Currency code (e.g. "USDC", "ETH") */
  currency: string;

  /** x402 settlement transaction hash */
  settlement_tx: TxHash;

  /** ISO-8601 timestamp of receipt creation */
  timestamp: Timestamp;

  /** BOND mandate ID for recurring receipts (optional) */
  mandate_id?: string;

  /** Period indicator for recurring receipts (e.g. "period 1/7") */
  period?: string;

  /** AgentTax tax line item (optional) */
  tax_line?: TaxLine;
}

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

/** Result returned after minting a receipt on-chain */
export interface MintResult {
  /** EAS attestation UID */
  attestation_uid: AttestationUID;
  /** Transaction hash of the mint transaction */
  tx_hash: TxHash;
  /** SHA-256 of the receipt data as stored */
  receipt_hash: SHA256Hash;
  /** ISO-8601 timestamp of the on-chain confirmation */
  minted_at: Timestamp;
}

/** Configuration for the receipt minter */
export interface MinterConfig {
  /** EAS contract address on Base */
  eas_contract_address: string;
  /** Schema UID registered on EAS */
  schema_uid: string;
  /** RPC endpoint for Base network */
  rpc_url: string;
  /** Private key or signer for transactions */
  signer: string | object;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/** Result of verifying a receipt on-chain */
export interface VerificationResult {
  /** Whether the attestation exists on-chain */
  exists: boolean;
  /** Whether the deal_hash matches the on-chain data */
  hash_valid: boolean;
  /** Whether the attestation has been revoked */
  revoked: boolean;
  /** The decoded receipt data (if exists) */
  receipt?: DealReceipt;
  /** EAS attestation UID */
  attestation_uid?: AttestationUID;
}

/** Configuration for the receipt verifier */
export interface VerifierConfig {
  /** EAS contract address on Base */
  eas_contract_address: string;
  /** RPC endpoint for Base network (read-only) */
  rpc_url: string;
}

// ---------------------------------------------------------------------------
// Indexer (interface only — implementation is proprietary)
// ---------------------------------------------------------------------------

/** Query parameters for searching receipts */
export interface ReceiptQuery {
  /** Filter by requester or provider DID */
  did?: DID;
  /** Filter by capability ID */
  capability_id?: string;
  /** Start of date range (ISO-8601) */
  from?: Timestamp;
  /** End of date range (ISO-8601) */
  to?: Timestamp;
  /** Filter by currency */
  currency?: string;
  /** Filter by BOND mandate ID */
  mandate_id?: string;
  /** Maximum results to return */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

/** A receipt with its on-chain attestation metadata */
export interface IndexedReceipt {
  /** The deal receipt data */
  receipt: DealReceipt;
  /** EAS attestation UID */
  attestation_uid: AttestationUID;
  /** Block number of the mint transaction */
  block_number: number;
  /** Mint transaction hash */
  tx_hash: TxHash;
}
