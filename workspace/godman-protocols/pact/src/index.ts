/**
 * PACT — Protocol for Agent Coordination and Trust
 * Public API surface (skeleton)
 * @version 0.1.0-skeleton
 *
 * Implementation stubs only. Real logic TBD in v0.2+.
 */

export type {
  AgentId,
  Signature,
  Timestamp,
  Mandate,
  MandateScope,
  TrustAnchor,
  CoordinationFrame,
  RevocationEntry,
} from './types.js';

/** Protocol version constant */
export const PACT_VERSION = '0.1' as const;

/**
 * Create a new Mandate skeleton (unsigned).
 * Call grantor.sign(mandate) to complete.
 */
export function createMandate(
  _grantor: string,
  _grantee: string,
  _scope: import('./types.js').MandateScope,
  _expiresAt?: string | null,
): import('./types.js').Mandate {
  throw new Error('PACT createMandate: not implemented — skeleton phase');
}

/**
 * Verify a Mandate signature against a Trust Anchor.
 */
export function verifyMandate(
  _mandate: import('./types.js').Mandate,
  _trustAnchor: import('./types.js').TrustAnchor,
): boolean {
  throw new Error('PACT verifyMandate: not implemented — skeleton phase');
}

/**
 * Open a Coordination Frame for multi-agent task execution.
 */
export function openFrame(
  _initiator: string,
  _participants: string[],
  _mandateIds: string[],
): import('./types.js').CoordinationFrame {
  throw new Error('PACT openFrame: not implemented — skeleton phase');
}

/**
 * Revoke a Mandate and append to the Revocation Ledger.
 */
export function revokeMandate(
  _mandateId: string,
  _revokedBy: string,
  _reason?: string,
): import('./types.js').RevocationEntry {
  throw new Error('PACT revokeMandate: not implemented — skeleton phase');
}
