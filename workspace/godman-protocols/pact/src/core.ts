/**
 * PACT — Protocol for Agent Coordination and Trust
 * Core mandate lifecycle: create, hash, sign, revoke
 * @version 0.2.0
 */

import { createHash, createHmac, randomUUID } from 'node:crypto';
import type {
  AgentId,
  Mandate,
  MandateScope,
  RevocationEntry,
  Timestamp,
} from './types.js';

// ---------------------------------------------------------------------------
// Mandate creation
// ---------------------------------------------------------------------------

/**
 * Create an unsigned Mandate skeleton.
 * Call `signMandate(mandate, secret)` to attach a signature.
 */
export function createMandate(
  grantor: AgentId,
  grantee: AgentId,
  scope: MandateScope,
  options: {
    expiresAt?: Timestamp | null;
    id?: string;
    issuedAt?: Timestamp;
  } = {}
): Mandate {
  const now = new Date().toISOString();
  return {
    version: '0.1',
    id: options.id ?? randomUUID(),
    grantor,
    grantee,
    scope,
    issuedAt: options.issuedAt ?? now,
    expiresAt: options.expiresAt ?? null,
    signature: '', // unsigned — must call signMandate
  };
}

// ---------------------------------------------------------------------------
// Canonical hash (deterministic, order-stable)
// ---------------------------------------------------------------------------

/**
 * Produce a SHA-256 hash over the mandate's signable fields.
 * Signature field is excluded from the hash input.
 */
export function hashMandate(mandate: Omit<Mandate, 'signature'>): string {
  const payload = JSON.stringify({
    version: mandate.version,
    id: mandate.id,
    grantor: mandate.grantor,
    grantee: mandate.grantee,
    scope: {
      description: mandate.scope.description,
      actions: [...mandate.scope.actions].sort(),
      resources: [...mandate.scope.resources].sort(),
      maxPaymentUsdc: mandate.scope.maxPaymentUsdc,
    },
    issuedAt: mandate.issuedAt,
    expiresAt: mandate.expiresAt,
  });
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Sign a mandate using HMAC-SHA256 with the grantor's shared secret.
 * In production replace with EIP-712 / Ed25519 signing.
 * Returns a new Mandate with the signature field populated.
 */
export function signMandate(mandate: Mandate, grantorSecret: string): Mandate {
  const hash = hashMandate(mandate);
  const signature = createHmac('sha256', grantorSecret)
    .update(hash, 'hex')
    .digest('hex');
  return { ...mandate, signature };
}

// ---------------------------------------------------------------------------
// Revocation
// ---------------------------------------------------------------------------

/**
 * Create a RevocationEntry for a mandate.
 * Append this to your revocation ledger; the verifier checks it.
 */
export function revokeMandate(
  mandateId: string,
  revokedBy: AgentId,
  revokerSecret: string,
  reason?: string
): RevocationEntry {
  const revokedAt = new Date().toISOString();
  const payload = `${mandateId}:${revokedBy}:${revokedAt}`;
  const signature = createHmac('sha256', revokerSecret)
    .update(payload, 'utf8')
    .digest('hex');
  return { mandateId, revokedBy, revokedAt, reason, signature };
}
