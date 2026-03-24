/**
 * SCORE — Scoring and Reputation for Agent Outputs
 * Core type definitions (skeleton)
 * @version 0.1.0-skeleton
 */

export type AgentId = string;
export type Timestamp = string;
export type Signature = string;

/** A single criterion in a scoring rubric */
export interface Criterion {
  id: string;
  name: string;
  description: string;
  /** Weight 0.0–1.0 — all weights in a rubric must sum to 1.0 */
  weight: number;
}

/** A named scoring rubric with weighted criteria */
export interface Rubric {
  id: string;
  name: string;
  version: string;
  criteria: Criterion[];
}

/** A scored evaluation of a single agent output */
export interface Evaluation {
  id: string;
  rubricId: string;
  agentId: AgentId;
  /** Reference to the specific output being evaluated */
  outputRef: string;
  /** Per-criterion scores 0.0–1.0 */
  scores: Record<string, number>;
  /** Weighted composite score 0.0–1.0 */
  compositeScore: number;
  evaluatedBy: AgentId | 'human';
  evaluatedAt: Timestamp;
  signature: Signature;
  notes?: string;
}

/** Aggregated reputation score for an agent */
export interface Reputation {
  agentId: AgentId;
  /** Time-decayed weighted average of composite scores */
  score: number;
  /** Total number of evaluations */
  evaluationCount: number;
  /** ISO 8601 of most recent evaluation */
  lastEvaluatedAt: Timestamp;
  /** ISO 8601 of reputation calculation */
  calculatedAt: Timestamp;
}

/** An entry in the append-only audit trail */
export interface AuditEntry {
  evaluationId: string;
  agentId: AgentId;
  compositeScore: number;
  timestamp: Timestamp;
  signature: Signature;
}
