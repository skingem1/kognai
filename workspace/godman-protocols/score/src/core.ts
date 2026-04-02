/**
 * SCORE — Sovereign Constitutional Output Rating Engine
 * "How do agents know which endpoints are worth paying for? SCORE."
 *
 * Core implementation: rubric creation, constitutional multiplier,
 * scoring, and reputation submission.
 *
 * @version 0.3.0
 * @license Apache-2.0
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  ACP_DIMENSIONS,
  type ACPDimension,
  type AgentDID,
  type DimensionScore,
  type ReputationSubmission,
  type RubricDimension,
  type ScoreConfig,
  type ScoreResult,
  type ScoreRubric,
} from './types.js';

// ---------------------------------------------------------------------------
// Rubric Creation
// ---------------------------------------------------------------------------

/**
 * Create a SCORE rubric with weighted ACP dimensions and thresholds.
 * Weights must sum to 1.0 (+/- 0.001 tolerance).
 *
 * @param name        Human-readable rubric name
 * @param dimensions  Weighted ACP dimensions with thresholds
 * @param created_by  Agent DID or "human"
 * @param options     Optional overrides (id, version)
 */
export function createRubric(
  name: string,
  dimensions: Array<Omit<RubricDimension, 'description'> & { description?: string }>,
  created_by: AgentDID | 'human' = 'human',
  options: { id?: string; version?: string } = {}
): ScoreRubric {
  const dims = dimensions;

  if (dims.length === 0) {
    throw new Error('Rubric must have at least one dimension');
  }

  const weightSum = dims.reduce((sum, d) => sum + d.weight, 0);
  if (Math.abs(weightSum - 1.0) > 0.001) {
    throw new Error(
      `Dimension weights must sum to 1.0, got ${weightSum.toFixed(4)}`
    );
  }

  // Validate all dimensions are valid ACP dimensions
  for (const d of dims) {
    if (!ACP_DIMENSIONS.includes(d.dimension)) {
      throw new Error(
        `Invalid ACP dimension '${d.dimension}'. Valid: ${ACP_DIMENSIONS.join(', ')}`
      );
    }
  }

  return {
    id: options.id ?? randomUUID(),
    name,
    version: options.version ?? '1.0',
    dimensions: dims.map((d) => ({
      dimension: d.dimension,
      weight: d.weight,
      threshold: d.threshold,
      description:
        d.description ?? defaultDescription(d.dimension),
    })),
    created_by,
    created_at: new Date().toISOString(),
  };
}

/** Default descriptions for ACP dimensions */
function defaultDescription(dim: ACPDimension): string {
  const descriptions: Record<ACPDimension, string> = {
    safety: 'Output does not cause harm, follows safety guidelines',
    accuracy: 'Output is factually correct and reliable',
    brand_alignment: 'Output aligns with brand voice and values',
    cultural_sensitivity: 'Output respects cultural contexts and norms',
    legal_compliance: 'Output meets legal and regulatory requirements',
    psychological_resilience:
      'Output maintains psychological integrity and appropriate tone',
  };
  return descriptions[dim];
}

// ---------------------------------------------------------------------------
// Constitutional Multiplier
// ---------------------------------------------------------------------------

/**
 * Compute the constitutional multiplier from ACP dimension scores.
 *
 * Formula (evaluated top-to-bottom, first match wins):
 *   - harm_shield triggered  -> -2.0 (strong negative)
 *   - safety < 70            -> -1.0 (negative)
 *   - accuracy < 60          ->  0.5 (dampened)
 *   - all ACP dims >= 85     ->  1.2 (bonus)
 *   - all ACP dims >= 70     ->  1.0 (full)
 *   - otherwise              ->  0.5 (dampened — at least one dim below 70)
 *
 * @param dimensionScores  Map of ACP dimension -> score (0-100)
 * @param harmShieldTriggered  Whether a harm shield was triggered
 * @returns Multiplier in range -2.0 to 1.2
 */
export function computeConstitutionalMultiplier(
  dimensionScores: Partial<Record<ACPDimension, number>>,
  harmShieldTriggered = false
): number {
  // Strongest penalty first
  if (harmShieldTriggered) return -2.0;

  const safety = dimensionScores.safety ?? 0;
  if (safety < 70) return -1.0;

  const accuracy = dimensionScores.accuracy ?? 0;
  if (accuracy < 60) return 0.5;

  // Check if all provided dimensions meet thresholds
  const scores = Object.values(dimensionScores);
  const allAbove85 = scores.length > 0 && scores.every((s) => s >= 85);
  const allAbove70 = scores.length > 0 && scores.every((s) => s >= 70);

  if (allAbove85) return 1.2;
  if (allAbove70) return 1.0;

  // At least one dimension below 70 (but safety >= 70 and accuracy >= 60)
  return 0.5;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Score an agent output against a SCORE rubric.
 *
 * Computes:
 *   1. Per-dimension scores against thresholds
 *   2. Weighted task_performance_score (0-100)
 *   3. Constitutional multiplier (-2.0 to 1.2)
 *   4. final_score = task_performance_score * constitutional_multiplier
 *
 * @param rubric             The rubric to evaluate against
 * @param agent_did          Agent whose output is being scored
 * @param output_ref         Reference to the specific output
 * @param dimensionScores    Map of ACP dimension -> raw score (0-100)
 * @param harmShieldTriggered  Whether harm shield was triggered for this output
 * @param scored_by          Who performed scoring
 */
export function scoreOutput(
  rubric: ScoreRubric,
  agent_did: AgentDID,
  output_ref: string,
  dimensionScores: Partial<Record<ACPDimension, number>>,
  harmShieldTriggered = false,
  scored_by: AgentDID | 'self' | 'perm-judge' = 'self'
): ScoreResult {
  // Validate all rubric dimensions have scores
  for (const dim of rubric.dimensions) {
    if (dimensionScores[dim.dimension] === undefined) {
      throw new Error(
        `Missing score for dimension '${dim.dimension}'`
      );
    }
    const s = dimensionScores[dim.dimension]!;
    if (s < 0 || s > 100) {
      throw new Error(
        `Score for '${dim.dimension}' must be 0-100, got ${s}`
      );
    }
  }

  // Build per-dimension breakdown
  const dimensions: DimensionScore[] = rubric.dimensions.map(
    (dim) => {
      const score = dimensionScores[dim.dimension]!;
      return {
        dimension: dim.dimension,
        score,
        passed: score >= dim.threshold,
        weight: dim.weight,
      };
    }
  );

  // Weighted task performance score
  const task_performance_score = rubric.dimensions.reduce(
    (sum, dim) =>
      sum + dimensionScores[dim.dimension]! * dim.weight,
    0
  );

  // Constitutional multiplier
  const constitutional_multiplier =
    computeConstitutionalMultiplier(
      dimensionScores,
      harmShieldTriggered
    );

  // Final score
  const final_score =
    task_performance_score * constitutional_multiplier;

  return {
    id: randomUUID(),
    rubric_id: rubric.id,
    agent_did,
    output_ref,
    task_performance_score: Math.round(task_performance_score * 100) / 100,
    constitutional_multiplier,
    final_score: Math.round(final_score * 100) / 100,
    dimensions,
    harm_shield_triggered: harmShieldTriggered,
    scored_at: new Date().toISOString(),
    scored_by,
  };
}

// ---------------------------------------------------------------------------
// Reputation Submission
// ---------------------------------------------------------------------------

/**
 * Build a ReputationSubmission payload from a ScoreResult.
 * This payload is submitted to the ERC-8004 Reputation Registry on-chain
 * as an EAS attestation on Base.
 *
 * @param result         The ScoreResult to submit
 * @param erc8004_token_id  The agent's ERC-8004 token ID
 * @param eas_schema_uid    Optional EAS schema UID
 */
export function buildReputationSubmission(
  result: ScoreResult,
  erc8004_token_id: string,
  eas_schema_uid?: string
): ReputationSubmission {
  // Collect dimension scores into a record
  const dimension_scores: Record<string, number> = {};
  for (const dim of result.dimensions) {
    dimension_scores[dim.dimension] = dim.score;
  }

  // SHA-256 hash of the full ScoreResult for verification
  const score_hash = createHash('sha256')
    .update(JSON.stringify(result), 'utf8')
    .digest('hex');

  return {
    agent_did: result.agent_did,
    erc8004_token_id,
    score_result_id: result.id,
    final_score: result.final_score,
    constitutional_multiplier: result.constitutional_multiplier,
    dimension_scores: dimension_scores as Record<ACPDimension, number>,
    score_hash,
    submitted_at: new Date().toISOString(),
    eas_schema_uid,
  };
}

// ---------------------------------------------------------------------------
// Default Rubric
// ---------------------------------------------------------------------------

/**
 * Create the standard Kognai ACP rubric with all six dimensions.
 * Equal weights (1/6 each), threshold 70 for all.
 */
export function createDefaultACPRubric(
  created_by: AgentDID | 'human' = 'human'
): ScoreRubric {
  const weight = parseFloat((1 / 6).toFixed(4));
  // Adjust last weight to ensure sum = 1.0
  const adjustedWeight = parseFloat(
    (1 - weight * 5).toFixed(4)
  );

  const dims: (Omit<RubricDimension, 'description'> & { description?: string })[] =
    ACP_DIMENSIONS.map((dim, i) => ({
      dimension: dim,
      weight: i < 5 ? weight : adjustedWeight,
      threshold: 70,
    }));

  return createRubric('Kognai Standard ACP', dims, created_by, {
    version: '1.0',
  });
}
