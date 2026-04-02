/**
 * SCORE — Sovereign Constitutional Output Rating Engine
 * "How do agents know which endpoints are worth paying for? SCORE."
 *
 * Public API surface.
 * @version 0.3.0
 * @license Apache-2.0
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  AgentDID,
  Timestamp,
  Hash,
  ACPDimension,
  RubricDimension,
  ScoreRubric,
  DimensionScore,
  ScoreResult,
  ReputationSubmission,
  ScoreConfig,
} from './types.js';

export { ACP_DIMENSIONS } from './types.js';

// ---------------------------------------------------------------------------
// Core implementation
// ---------------------------------------------------------------------------

export {
  createRubric,
  computeConstitutionalMultiplier,
  scoreOutput,
  buildReputationSubmission,
  createDefaultACPRubric,
} from './core.js';

// ---------------------------------------------------------------------------
// Protocol version
// ---------------------------------------------------------------------------

/** Protocol version constant */
export const SCORE_VERSION = '0.3' as const;
