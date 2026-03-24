/**
 * SCORE — Scoring and Reputation for Agent Outputs
 * Public API surface
 * @version 0.2.0
 */

// Types
export type {
  AgentId,
  Timestamp,
  Signature,
  Criterion,
  Rubric,
  Evaluation,
  Reputation,
  AuditEntry,
} from './types.js';

// Core implementation
export {
  createRubric,
  evaluate,
  calculateReputation,
  createAuditEntry,
} from './core.js';

/** Protocol version constant */
export const SCORE_VERSION = '0.2' as const;
