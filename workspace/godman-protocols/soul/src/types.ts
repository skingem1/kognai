/**
 * SOUL — Sovereign Open Universal Layer
 * "One layer. Every chain. Every model. SOUL."
 *
 * Agent constitutional identity standard. Defines the SOUL.md format —
 * a machine-readable constitutional passport declaring who the agent is,
 * what it believes, and what constraints govern it. Anchored on-chain via ERC-8004.
 *
 * @version 0.3.0
 */

// ---------------------------------------------------------------------------
// Primitive aliases
// ---------------------------------------------------------------------------

/** ISO 8601 timestamp */
export type Timestamp = string;

/** SHA-256 hex digest */
export type SHA256Hash = string;

/** Ethereum address (0x-prefixed) */
export type EthAddress = string;

/** ERC-8004 token ID (uint256 as string) */
export type TokenId = string;

/** Chain ID (e.g. 8453 for Base) */
export type ChainId = number;

// ---------------------------------------------------------------------------
// SOUL.md section keys — the 9 required sections
// ---------------------------------------------------------------------------

/**
 * The 9 required sections of a SOUL.md document.
 * These map to the headings in the canonical SOUL.md format.
 */
export type SoulSectionKey =
  | 'who_we_are'
  | 'why_we_exist'
  | 'what_we_believe'
  | 'what_we_will_never_do'
  | 'what_we_owe_the_world'
  | 'what_we_owe_each_other'
  | 'founding_intention'
  | 'self_committed_swarms'
  | 'constitutional_foundation';

/**
 * Human-readable titles for each required section key.
 */
export const SOUL_SECTION_TITLES: Record<SoulSectionKey, string> = {
  who_we_are: 'Who We Are',
  why_we_exist: 'Why We Exist',
  what_we_believe: 'What We Believe',
  what_we_will_never_do: 'What We Will Never Do',
  what_we_owe_the_world: 'What We Owe the World',
  what_we_owe_each_other: 'What We Owe Each Other',
  founding_intention: 'The Founding Intention',
  self_committed_swarms: 'Self Committed Swarms',
  constitutional_foundation: 'Constitutional Foundation',
} as const;

/**
 * Ordered list of required section keys (canonical ordering in SOUL.md).
 */
export const REQUIRED_SECTION_KEYS: readonly SoulSectionKey[] = [
  'who_we_are',
  'why_we_exist',
  'what_we_believe',
  'what_we_will_never_do',
  'what_we_owe_the_world',
  'what_we_owe_each_other',
  'founding_intention',
  'self_committed_swarms',
  'constitutional_foundation',
] as const;

// ---------------------------------------------------------------------------
// Core interfaces
// ---------------------------------------------------------------------------

/**
 * A single section of a SOUL.md document.
 */
export interface SoulSection {
  /** Human-readable section title (e.g. "Who We Are") */
  title: string;

  /** The markdown content of this section (body text, lists, etc.) */
  content: string;

  /**
   * Whether this section is constitutionally immutable.
   * Immutable sections cannot be modified after initial publication
   * without invalidating the on-chain ERC-8004 anchor.
   */
  immutable: boolean;
}

/**
 * A complete SOUL.md document — the agent's constitutional identity passport.
 *
 * Contains exactly 9 required sections that declare the agent's identity,
 * beliefs, constraints, and constitutional foundation.
 */
export interface SoulDocument {
  /** SOUL format version */
  soul_version: '1.0';

  /** Agent or organisation name */
  agent_name: string;

  /** Agent DID (e.g. "did:kognai:harvey") */
  agent_did: string;

  /** ISO 8601 timestamp of when this SOUL.md was created */
  created_at: Timestamp;

  /** ISO 8601 timestamp of the most recent update */
  updated_at: Timestamp;

  // --- The 9 required sections ---

  who_we_are: SoulSection;
  why_we_exist: SoulSection;
  what_we_believe: SoulSection;
  what_we_will_never_do: SoulSection;
  what_we_owe_the_world: SoulSection;
  what_we_owe_each_other: SoulSection;
  founding_intention: SoulSection;
  self_committed_swarms: SoulSection;
  constitutional_foundation: SoulSection;

  /** Optional ERC-8004 on-chain anchor metadata */
  erc8004_anchor?: ERC8004Anchor;
}

/**
 * ERC-8004 on-chain anchor for a SOUL.md document.
 *
 * SHA-256(SOUL.md) is committed on-chain as an identity token.
 * This allows any agent to verify that a SOUL.md has not been
 * tampered with by comparing the local hash against the on-chain value.
 */
export interface ERC8004Anchor {
  /** ERC-8004 token ID on the identity contract */
  token_id: TokenId;

  /** SHA-256 hash of the canonical SOUL.md content */
  soul_hash: SHA256Hash;

  /** Chain ID where the anchor lives (e.g. 8453 for Base) */
  chain_id: ChainId;

  /** Address of the ERC-8004 identity contract */
  contract_address: EthAddress;
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

/**
 * Result of validating a SoulDocument against the SOUL format spec.
 */
export interface SoulValidationResult {
  /** Whether the document passes all validation checks */
  valid: boolean;

  /** List of validation errors (empty if valid) */
  errors: string[];

  /** List of warnings (non-blocking) */
  warnings: string[];
}

/**
 * Result of verifying a SOUL.md against its on-chain ERC-8004 anchor.
 */
export interface SoulVerificationResult {
  /** Whether the SOUL.md hash matches the on-chain anchor */
  verified: boolean;

  /** The locally computed SHA-256 hash of the SOUL.md content */
  computed_hash: SHA256Hash;

  /** The on-chain hash from the ERC-8004 anchor (if available) */
  on_chain_hash: SHA256Hash | null;

  /** Human-readable explanation */
  reason: string;
}

// ---------------------------------------------------------------------------
// Publisher config
// ---------------------------------------------------------------------------

/**
 * Configuration for SoulPublisher — hosts SOUL.md at /.well-known/soul.md
 */
export interface SoulPublisherConfig {
  /** Port to listen on (default: 3000) */
  port?: number;

  /** Hostname to bind to (default: '0.0.0.0') */
  hostname?: string;

  /** Path to serve SOUL.md at (default: '/.well-known/soul.md') */
  path?: string;
}
