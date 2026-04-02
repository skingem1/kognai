/**
 * SCORE — Sovereign Constitutional Output Rating Engine
 * "How do agents know which endpoints are worth paying for? SCORE."
 *
 * Core type definitions for self-scoring rubric protocol.
 * Agents rate quality of their own outputs against constitutional criteria.
 * Scores submitted to ERC-8004 Reputation Registry on-chain.
 *
 * @version 0.3.0
 * @license Apache-2.0
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** DID-style agent identifier (e.g. "did:kognai:messi") */
export type AgentDID = string;

/** ISO 8601 timestamp */
export type Timestamp = string;

/** SHA-256 hex hash */
export type Hash = string;

// ---------------------------------------------------------------------------
// ACP Dimensions
// ---------------------------------------------------------------------------

/**
 * The six Agent Constitutional Performance dimensions.
 * Every agent output is scored across all six.
 */
export type ACPDimension =
  | 'safety'
  | 'accuracy'
  | 'brand_alignment'
  | 'cultural_sensitivity'
  | 'legal_compliance'
  | 'psychological_resilience';

/** All six ACP dimension keys, ordered */
export const ACP_DIMENSIONS: readonly ACPDimension[] = [
  'safety',
  'accuracy',
  'brand_alignment',
  'cultural_sensitivity',
  'legal_compliance',
  'psychological_resilience',
] as const;

// ---------------------------------------------------------------------------
// Score Rubric
// ---------------------------------------------------------------------------

/** A single scored dimension within a rubric */
export interface RubricDimension {
  /** ACP dimension key */
  dimension: ACPDimension;
  /** Weight 0.0-1.0 for this dimension in composite score */
  weight: number;
  /** Minimum acceptable score (0-100) for this dimension */
  threshold: number;
  /** Human-readable description of what this dimension measures */
  description: string;
}

/**
 * A SCORE rubric defines how an agent output is evaluated.
 * Contains weighted dimensions, thresholds, and metadata.
 */
export interface ScoreRubric {
  /** Unique rubric identifier */
  id: string;
  /** Human-readable rubric name */
  name: string;
  /** Rubric schema version */
  version: string;
  /** Weighted ACP dimensions to evaluate against */
  dimensions: RubricDimension[];
  /** Rubric creator (agent DID or "human") */
  created_by: AgentDID | 'human';
  /** ISO 8601 creation timestamp */
  created_at: Timestamp;
}

// ---------------------------------------------------------------------------
// Score Result
// ---------------------------------------------------------------------------

/** Per-dimension score breakdown */
export interface DimensionScore {
  dimension: ACPDimension;
  /** Raw score 0-100 */
  score: number;
  /** Whether this dimension met its threshold */
  passed: boolean;
  /** Weight applied to this dimension */
  weight: number;
}

/**
 * The result of scoring an agent output.
 * Combines task performance with constitutional multiplier.
 */
export interface ScoreResult {
  /** Unique score result identifier */
  id: string;
  /** Reference to the rubric used */
  rubric_id: string;
  /** Agent that produced the output */
  agent_did: AgentDID;
  /** Reference to the specific output scored */
  output_ref: string;
  /** Raw task performance score 0-100 (weighted composite of dimension scores) */
  task_performance_score: number;
  /** Constitutional multiplier applied (-2.0 to 1.2) */
  constitutional_multiplier: number;
  /** Final score = task_performance_score * constitutional_multiplier */
  final_score: number;
  /** Per-dimension breakdown */
  dimensions: DimensionScore[];
  /** Whether any harm shield was triggered */
  harm_shield_triggered: boolean;
  /** ISO 8601 timestamp of scoring */
  scored_at: Timestamp;
  /** Who performed the scoring (self, peer, or perm-judge) */
  scored_by: AgentDID | 'self' | 'perm-judge';
}

// ---------------------------------------------------------------------------
// Reputation Submission
// ---------------------------------------------------------------------------

/**
 * Payload for submitting a score to ERC-8004 Reputation Registry on-chain.
 * Minted as an EAS attestation on Base.
 */
export interface ReputationSubmission {
  /** Agent DID whose reputation is being updated */
  agent_did: AgentDID;
  /** ERC-8004 identity token ID on-chain */
  erc8004_token_id: string;
  /** The ScoreResult ID being submitted */
  score_result_id: string;
  /** Final score from ScoreResult */
  final_score: number;
  /** Constitutional multiplier from ScoreResult */
  constitutional_multiplier: number;
  /** Per-dimension scores for transparency */
  dimension_scores: Record<ACPDimension, number>;
  /** SHA-256 hash of the full ScoreResult for verification */
  score_hash: Hash;
  /** ISO 8601 timestamp of submission */
  submitted_at: Timestamp;
  /** EAS schema UID for reputation attestations */
  eas_schema_uid?: string;
  /** Base chain transaction hash (set after on-chain submission) */
  tx_hash?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** SCORE protocol configuration */
export interface ScoreConfig {
  /** Default rubric to use when none specified */
  default_rubric_id?: string;
  /** Whether to auto-submit scores to on-chain registry */
  auto_submit_reputation: boolean;
  /** ERC-8004 contract address on Base */
  erc8004_contract?: string;
  /** EAS schema UID for reputation attestations */
  eas_reputation_schema?: string;
}
