/**
 * DRS — Deal Receipt Standard
 * EAS Schema definition for on-chain deal receipts
 *
 * @version 0.3.0
 */

// ---------------------------------------------------------------------------
// EAS Schema — defines the on-chain attestation structure
// ---------------------------------------------------------------------------

/**
 * The EAS schema string for DRS deal receipts.
 *
 * This schema is registered on Base via the Ethereum Attestation Service.
 * Each field maps directly to the DealReceipt interface.
 *
 * Schema fields:
 *  - deal_hash:       SHA-256 of the PACT negotiation deal
 *  - pact_session_id: Session ID from the PACT negotiation
 *  - requester_did:   DID of the requesting agent
 *  - provider_did:    DID of the providing agent
 *  - capability_id:   LAX capability identifier
 *  - payment_amount:  Payment amount as string (precision-safe)
 *  - currency:        Currency code (e.g. "USDC")
 *  - settlement_tx:   x402 settlement transaction hash
 *  - timestamp:       ISO-8601 receipt creation time
 *  - mandate_id:      BOND mandate ID (empty string if none)
 *  - period:          Recurring period (empty string if none)
 *  - tax_line:        JSON-encoded TaxLine (empty string if none)
 */
export const RECEIPT_SCHEMA_FIELDS: string[] = [
  'bytes32 deal_hash',
  'string pact_session_id',
  'string requester_did',
  'string provider_did',
  'string capability_id',
  'string payment_amount',
  'string currency',
  'bytes32 settlement_tx',
  'uint64 timestamp',
  'string mandate_id',
  'string period',
  'string tax_line',
];

/** EAS-compatible schema string (comma-separated field definitions) */
export const RECEIPT_SCHEMA: string = RECEIPT_SCHEMA_FIELDS.join(',');

/**
 * Human-readable schema name for EAS registration.
 */
export const RECEIPT_SCHEMA_NAME = 'DRS.DealReceipt.v1' as const;

/**
 * Schema description for EAS registration.
 */
export const RECEIPT_SCHEMA_DESCRIPTION =
  'Deal Receipt Standard — on-chain receipt for agent-to-agent transactions via x402' as const;

/**
 * Full schema definition object for EAS registration.
 */
export const ReceiptSchema = {
  name: RECEIPT_SCHEMA_NAME,
  description: RECEIPT_SCHEMA_DESCRIPTION,
  schema: RECEIPT_SCHEMA,
  /** Whether the schema is revocable (receipts can be voided) */
  revocable: true,
  /** Resolver contract address (0x0 = no resolver) */
  resolver: '0x0000000000000000000000000000000000000000',
} as const;
