/**
 * DRS — Deal Receipt Standard
 * ReceiptMinter: mint deal receipts as EAS attestations on Base
 *
 * @version 0.3.0
 */

import { createHash } from 'node:crypto';
import type {
  DealReceipt,
  MintResult,
  MinterConfig,
  SHA256Hash,
} from './types.js';
import { RECEIPT_SCHEMA } from './schema.js';

// ---------------------------------------------------------------------------
// ReceiptMinter
// ---------------------------------------------------------------------------

/**
 * Mints DRS deal receipts as EAS attestations on Base.
 *
 * In v0.3.0 this class provides:
 *  - Receipt hash computation (SHA-256 of canonical receipt JSON)
 *  - Attestation data encoding (matches RECEIPT_SCHEMA)
 *  - mint() stub that returns the prepared attestation payload
 *
 * Actual on-chain transaction submission requires an EAS SDK or ethers.js
 * signer, which is injected via config. The mint() method prepares the
 * attestation request object; integrators wire their own signer.
 */
export class ReceiptMinter {
  private readonly config: MinterConfig;

  constructor(config: MinterConfig) {
    this.config = config;
  }

  /**
   * Compute the SHA-256 hash of a deal receipt.
   * Uses deterministic JSON serialisation (sorted keys).
   */
  computeHash(receipt: DealReceipt): SHA256Hash {
    const canonical = JSON.stringify(receipt, Object.keys(receipt).sort());
    return createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Encode a DealReceipt into the EAS attestation data format.
   * Returns a tuple of values matching RECEIPT_SCHEMA field order.
   */
  encodeAttestationData(receipt: DealReceipt): {
    schema: string;
    data: {
      deal_hash: string;
      pact_session_id: string;
      requester_did: string;
      provider_did: string;
      capability_id: string;
      payment_amount: string;
      currency: string;
      settlement_tx: string;
      timestamp: number;
      mandate_id: string;
      period: string;
      tax_line: string;
    };
  } {
    return {
      schema: RECEIPT_SCHEMA,
      data: {
        deal_hash: `0x${receipt.deal_hash}`,
        pact_session_id: receipt.pact_session_id,
        requester_did: receipt.requester_did,
        provider_did: receipt.provider_did,
        capability_id: receipt.capability_id,
        payment_amount: receipt.payment_amount,
        currency: receipt.currency,
        settlement_tx: `0x${receipt.settlement_tx}`,
        timestamp: Math.floor(new Date(receipt.timestamp).getTime() / 1000),
        mandate_id: receipt.mandate_id ?? '',
        period: receipt.period ?? '',
        tax_line: receipt.tax_line ? JSON.stringify(receipt.tax_line) : '',
      },
    };
  }

  /**
   * Mint a deal receipt as an EAS attestation.
   *
   * In v0.3.0 this returns the prepared attestation request and computed
   * hash. Actual on-chain submission is left to the integrator's signer.
   *
   * Returns a MintResult with placeholder tx_hash and attestation_uid
   * that the integrator replaces after broadcasting the transaction.
   */
  async mint(receipt: DealReceipt): Promise<MintResult> {
    const receiptHash = this.computeHash(receipt);
    const attestationData = this.encodeAttestationData(receipt);

    // In a full implementation, this is where we would:
    // 1. Connect to the EAS contract at config.eas_contract_address
    // 2. Call eas.attest({ schema: config.schema_uid, data: attestationData })
    // 3. Wait for transaction confirmation
    // 4. Return the real attestation_uid and tx_hash

    // v0.3.0: Return the prepared payload for integrators
    return {
      attestation_uid: `pending:${receiptHash.slice(0, 16)}`,
      tx_hash: `pending:${receiptHash.slice(16, 32)}`,
      receipt_hash: receiptHash,
      minted_at: new Date().toISOString(),
    };
  }

  /**
   * Get the minter configuration (read-only).
   */
  getConfig(): Readonly<MinterConfig> {
    return { ...this.config };
  }
}
