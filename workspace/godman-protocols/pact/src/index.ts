/**
 * PACT — Protocol for Agent Coordination and Trust
 * Public API surface
 * @version 0.2.0
 */

// Types
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

// Core mandate lifecycle
export {
  createMandate,
  hashMandate,
  signMandate,
  revokeMandate,
} from './core.js';

// Verification
export type { VerifyResult } from './verifier.js';
export {
  verifyMandate,
  scopeCovers,
  paymentAllowed,
} from './verifier.js';

// Coordination frame lifecycle
export { CoordinationError, openFrame, closeFrame, abortFrame, addParticipant, addMandateToFrame } from './coordinator.js';

// Mandate registry
export { MandateRegistry, defaultRegistry } from './registry.js';

/** Protocol version constant */
export const PACT_VERSION = '0.2' as const;
