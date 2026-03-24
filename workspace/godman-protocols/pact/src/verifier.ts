/**
 * PACT — Protocol for Agent Coordination and Trust
 * Verifier: signature validation, expiry, revocation check
 * @version 0.2.0
 */

import { createHmac } from 'node:crypto';
import type { Mandate, RevocationEntry } from './types.js';
import { hashMandate } from './core.js';

// ---------------------------------------------------------------------------
// Verification result
// ---------------------------------------------------------------------------

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: string };

// ---------------------------------------------------------------------------
// Mandate verification
// ---------------------------------------------------------------------------

/**
 * Verify a mandate is:
 *  1. Properly signed by the grantor (HMAC-SHA256 with shared secret)
 *  2. Not yet expired
 *  3. Not in the revocation ledger
 *
 * @param mandate      The mandate to verify
 * @param grantorSecret The grantor's shared secret used at signing time
 * @param revocationLedger Optional list of revocation entries to check against
 * @param asOf         ISO 8601 timestamp to check expiry against (default: now)
 */
export function verifyMandate(
  mandate: Mandate,
  grantorSecret: string,
  revocationLedger: RevocationEntry[] = [],
  asOf?: string
): VerifyResult {
  // 1. Signature check
  const hash = hashMandate(mandate);
  const expected = createHmac('sha256', grantorSecret)
    .update(hash, 'hex')
    .digest('hex');

  if (mandate.signature !== expected) {
    return { valid: false, reason: 'invalid_signature' };
  }

  // 2. Expiry check
  if (mandate.expiresAt !== null) {
    const expiry = new Date(mandate.expiresAt).getTime();
    const now = new Date(asOf ?? new Date().toISOString()).getTime();
    if (now > expiry) {
      return { valid: false, reason: 'expired' };
    }
  }

  // 3. Revocation check
  const isRevoked = revocationLedger.some(
    (entry) => entry.mandateId === mandate.id
  );
  if (isRevoked) {
    return { valid: false, reason: 'revoked' };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Scope check
// ---------------------------------------------------------------------------

/**
 * Check whether a mandate's scope covers a given action on a resource.
 * Returns false if the mandate is not verified — call verifyMandate first.
 */
export function scopeCovers(
  mandate: Mandate,
  action: string,
  resource: string
): boolean {
  const { actions, resources } = mandate.scope;
  const actionAllowed = actions.includes(action) || actions.includes('*');
  const resourceAllowed = resources.some(
    (pattern) =>
      pattern === '*' ||
      pattern === resource ||
      resource.startsWith(pattern.replace(/\*$/, ''))
  );
  return actionAllowed && resourceAllowed;
}

// ---------------------------------------------------------------------------
// Payment guard
// ---------------------------------------------------------------------------

/**
 * Returns true if the mandate permits a payment of `amountUsdc`.
 */
export function paymentAllowed(mandate: Mandate, amountUsdc: number): boolean {
  const { maxPaymentUsdc } = mandate.scope;
  if (maxPaymentUsdc === null) return false;
  return amountUsdc <= maxPaymentUsdc;
}
