/**
 * PACT — Protocol for Agent Constitutional Trust
 * "Negotiate before you integrate."
 *
 * Core type definitions for the five-chamber trust and negotiation protocol.
 * @version 0.3.0
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** A unique agent identifier — DID, ERC-8004 token, or scoped handle */
export type AgentDID = string;

/** ISO 8601 timestamp */
export type Timestamp = string;

/** SHA-256 hex string */
export type Hash = string;

/** HMAC-SHA256 hex string */
export type HMACSignature = string;

/** EIP-712 hex-encoded signature */
export type EIP712Signature = string;

// ---------------------------------------------------------------------------
// Trust Ceiling
// ---------------------------------------------------------------------------

/**
 * Trust ceiling derived from an agent's trust score.
 *
 * Mapping:
 * - 85-100 = FULL       (all capabilities, 24h TTL, 1.0x price)
 * - 70-84  = STANDARD   (core capabilities, 4h TTL, 1.2x price)
 * - 50-69  = RESTRICTED (read-only, 1h TTL, 1.5x price)
 * - 30-49  = MINIMAL    (single-capability observed, 15m TTL, 2.0x price)
 * - <30    = REJECTED
 * - Unknown = PROVISIONAL (single-capability observed, 15m TTL, 2.5x price)
 */
export type TrustCeiling =
  | 'FULL'
  | 'STANDARD'
  | 'RESTRICTED'
  | 'MINIMAL'
  | 'REJECTED'
  | 'PROVISIONAL';

/** Configuration for each trust ceiling tier */
export interface TrustCeilingConfig {
  ceiling: TrustCeiling;
  /** Minimum trust score for this tier (inclusive). null for PROVISIONAL */
  minScore: number | null;
  /** Maximum trust score for this tier (inclusive). null for PROVISIONAL */
  maxScore: number | null;
  /** Capabilities access level */
  capabilities: 'all' | 'core' | 'read-only' | 'single-capability' | 'none';
  /** Session time-to-live in seconds */
  ttlSeconds: number;
  /** Price multiplier applied to negotiated rates */
  priceMultiplier: number;
}

// ---------------------------------------------------------------------------
// Chamber 1 — Public Entry Gate
// ---------------------------------------------------------------------------

/** Rate limit configuration for the public entry gate */
export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  burstLimit: number;
}

/** Result of the Public Entry Gate chamber */
export interface PublicEntryGateResult {
  chamber: 1;
  passed: boolean;
  agentDID: AgentDID;
  /** Whether rate limit was hit */
  rateLimited: boolean;
  /** Whether basic auth passed */
  authPassed: boolean;
  /** DID resolution succeeded */
  didResolved: boolean;
  timestamp: Timestamp;
  /** Reason for rejection, if any */
  rejectionReason?: string;
}

// ---------------------------------------------------------------------------
// Chamber 2 — Identity Analysis
// ---------------------------------------------------------------------------

/** Identity verification sources */
export type IdentityVerificationType = 'erc8004' | 'did' | 'helixa' | 'x402-wallet';

/** Result of the Identity Analysis chamber */
export interface IdentityAnalysisResult {
  chamber: 2;
  passed: boolean;
  agentDID: AgentDID;
  /** Verification method used */
  verificationType: IdentityVerificationType;
  /** ERC-8004 token ID, if applicable */
  erc8004TokenId?: string;
  /** Trust score from identity provider (0-100) */
  trustScore: number;
  /** Derived trust ceiling */
  trustCeiling: TrustCeiling;
  /** Jurisdiction code (ISO 3166-1 alpha-2) */
  jurisdiction?: string;
  timestamp: Timestamp;
  rejectionReason?: string;
}

// ---------------------------------------------------------------------------
// Chamber 3 — Intent Analysis
// ---------------------------------------------------------------------------

/** Result of a single injection scan pass */
export interface InjectionScanPass {
  passNumber: 1 | 2 | 3;
  clean: boolean;
  /** Detected threat patterns, if any */
  threats: string[];
}

/** Result of the Intent Analysis chamber */
export interface IntentAnalysisResult {
  chamber: 3;
  passed: boolean;
  agentDID: AgentDID;
  /** 3-pass prompt injection scanner results */
  injectionScans: [InjectionScanPass, InjectionScanPass, InjectionScanPass];
  /** Tone analysis score (0-1, where 1 = fully cooperative) */
  toneScore: number;
  /** Coherence check score (0-1, where 1 = fully coherent) */
  coherenceScore: number;
  timestamp: Timestamp;
  rejectionReason?: string;
}

// ---------------------------------------------------------------------------
// Chamber 4 — Negotiation Room
// ---------------------------------------------------------------------------

/** A capability declaration during negotiation */
export interface CapabilityDeclaration {
  skillId: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/** Payment terms proposed during negotiation */
export interface PaymentTerms {
  /** Payment rail (e.g. 'x402', 'usdc-base') */
  rail: string;
  /** Amount per invocation in the currency */
  amount: string;
  /** Currency code (e.g. 'USDC') */
  currency: string;
  /** Maximum total spend for the session */
  maxSessionSpend?: string;
}

/** EAS attestation reference */
export interface EASAttestation {
  uid: string;
  schema: string;
  chain: string;
}

/**
 * NegotiationSchema — the structured A2A dialogue that happens in Chamber 4.
 * Both agents exchange capability declarations, agree payment terms,
 * and dual-sign via EIP-712.
 */
export interface NegotiationSchema {
  /** Unique negotiation ID */
  negotiationId: string;
  /** Agent initiating the negotiation */
  requesterDID: AgentDID;
  /** Agent receiving the negotiation */
  providerDID: AgentDID;
  /** Capabilities offered by the provider */
  providerCapabilities: CapabilityDeclaration[];
  /** Capabilities requested by the requester */
  requestedCapabilities: string[];
  /** Agreed payment terms */
  paymentTerms: PaymentTerms;
  /** Trust ceiling applied to this session */
  trustCeiling: TrustCeiling;
  /** EIP-712 signature from requester */
  requesterSignature: EIP712Signature;
  /** EIP-712 signature from provider */
  providerSignature: EIP712Signature;
  /** EAS attestation reference, if submitted */
  easAttestation?: EASAttestation;
  /** SHA-256 hash of the negotiation deal */
  dealHash: Hash;
  timestamp: Timestamp;
}

/** Result of the Negotiation Room chamber */
export interface NegotiationRoomResult {
  chamber: 4;
  passed: boolean;
  negotiation: NegotiationSchema;
  timestamp: Timestamp;
  rejectionReason?: string;
}

// ---------------------------------------------------------------------------
// Chamber 5 — Secure Channel Issuance
// ---------------------------------------------------------------------------

/**
 * SessionToken — capability-locked token issued after successful negotiation.
 * Derived via HMAC(deal_hash + agent_did + expiry).
 */
export interface SessionToken {
  /** The token value (HMAC hex) */
  token: HMACSignature;
  /** Session ID (UUID v4) */
  sessionId: string;
  /** Agent DID this token is issued to */
  issuedTo: AgentDID;
  /** Agent DID that issued the token */
  issuedBy: AgentDID;
  /** Hash of the negotiated deal */
  dealHash: Hash;
  /** Trust ceiling applied */
  trustCeiling: TrustCeiling;
  /** Capabilities locked into this session */
  capabilities: string[];
  /** ISO 8601 — when the token was issued */
  issuedAt: Timestamp;
  /** ISO 8601 — when the token expires */
  expiresAt: Timestamp;
  /** Price multiplier applied */
  priceMultiplier: number;
}

/** Result of the Secure Channel Issuance chamber */
export interface SecureChannelIssuanceResult {
  chamber: 5;
  passed: boolean;
  sessionToken: SessionToken;
  timestamp: Timestamp;
  rejectionReason?: string;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** Status of a PACT session as it progresses through chambers */
export type PactSessionStatus =
  | 'pending'
  | 'chamber_1'
  | 'chamber_2'
  | 'chamber_3'
  | 'chamber_4'
  | 'chamber_5'
  | 'active'
  | 'rejected'
  | 'expired'
  | 'revoked';

/**
 * PactSession — the full state of a PACT negotiation and resulting session.
 * Tracks progress through all five chambers.
 */
export interface PactSession {
  /** Session ID (UUID v4) */
  sessionId: string;
  /** The requesting agent */
  requesterDID: AgentDID;
  /** The providing agent */
  providerDID: AgentDID;
  /** Current session status */
  status: PactSessionStatus;
  /** Chamber 1 result, if completed */
  chamber1?: PublicEntryGateResult;
  /** Chamber 2 result, if completed */
  chamber2?: IdentityAnalysisResult;
  /** Chamber 3 result, if completed */
  chamber3?: IntentAnalysisResult;
  /** Chamber 4 result, if completed */
  chamber4?: NegotiationRoomResult;
  /** Chamber 5 result, if completed */
  chamber5?: SecureChannelIssuanceResult;
  /** Final session token, set when status = 'active' */
  sessionToken?: SessionToken;
  /** ISO 8601 — session creation */
  createdAt: Timestamp;
  /** ISO 8601 — last status change */
  updatedAt: Timestamp;
  /** Rejection reason if status = 'rejected' */
  rejectionReason?: string;
  /** Which chamber rejected the session */
  rejectedAtChamber?: 1 | 2 | 3 | 4 | 5;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * PactConfig — configuration for a PACT endpoint.
 */
export interface PactConfig {
  /** Agent DID of this PACT endpoint */
  agentDID: AgentDID;
  /** Signing secret for HMAC session tokens (replace with key pair in prod) */
  signingSecret: string;
  /** Rate limit configuration for Chamber 1 */
  rateLimit: RateLimitConfig;
  /** Capabilities this agent offers */
  capabilities: CapabilityDeclaration[];
  /** Accepted payment rails */
  acceptedPaymentRails: string[];
  /** Custom trust ceiling overrides (by agent DID) */
  trustCeilingOverrides?: Record<AgentDID, TrustCeiling>;
  /** Whether to require EAS attestation in Chamber 4 */
  requireEASAttestation: boolean;
  /** EAS schema UID for deal attestations */
  easSchemaUID?: string;
  /** Base chain for on-chain operations (e.g. 'base', 'base-sepolia') */
  chain?: string;
}
