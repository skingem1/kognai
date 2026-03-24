/**
 * PACT — Protocol for Agent Coordination and Trust
 * Core type definitions (skeleton)
 * @version 0.1.0-skeleton
 */

/** A unique agent identifier — DID, x402 wallet address, or scoped handle */
export type AgentId = string;

/** Cryptographic signature (hex-encoded) */
export type Signature = string;

/** ISO 8601 timestamp */
export type Timestamp = string;

/**
 * A Mandate is a signed, scoped delegation from one agent to another.
 * Inspired by EIP-712 typed data signing.
 */
export interface Mandate {
  /** Protocol version */
  version: '0.1';
  /** Unique mandate ID (UUID v4) */
  id: string;
  /** Agent granting the mandate */
  grantor: AgentId;
  /** Agent receiving the mandate */
  grantee: AgentId;
  /** What the grantee is permitted to do */
  scope: MandateScope;
  /** ISO 8601 — when the mandate was issued */
  issuedAt: Timestamp;
  /** ISO 8601 — when the mandate expires (null = indefinite) */
  expiresAt: Timestamp | null;
  /** Grantor's cryptographic signature over the mandate fields */
  signature: Signature;
}

/**
 * The scope of authority conveyed by a Mandate.
 * Additive — unlisted capabilities are implicitly denied.
 */
export interface MandateScope {
  /** Human-readable description */
  description: string;
  /** Allowed action verbs (e.g. 'read', 'write', 'execute', 'pay') */
  actions: string[];
  /** Resource URIs or patterns this mandate covers */
  resources: string[];
  /** Maximum x402 payment per invocation in USDC (null = no payment allowed) */
  maxPaymentUsdc: number | null;
}

/**
 * Trust Anchor — a verifiable root of authority.
 * Used to resolve and validate agent identity.
 */
export interface TrustAnchor {
  type: 'did' | 'x402' | 'org-key';
  value: string;
  /** Optional human label */
  label?: string;
}

/**
 * Coordination Frame — shared execution context for multi-agent tasks.
 */
export interface CoordinationFrame {
  /** Unique frame ID */
  id: string;
  /** Agent that opened the frame */
  initiator: AgentId;
  /** Participating agents */
  participants: AgentId[];
  /** Active mandates in scope for this frame */
  mandateIds: string[];
  /** Frame status */
  status: 'open' | 'closed' | 'aborted';
  /** ISO 8601 */
  openedAt: Timestamp;
  /** ISO 8601 (null if still open) */
  closedAt: Timestamp | null;
}

/**
 * Revocation entry — appended to the Revocation Ledger when a mandate is invalidated.
 */
export interface RevocationEntry {
  mandateId: string;
  revokedBy: AgentId;
  revokedAt: Timestamp;
  reason?: string;
  signature: Signature;
}
