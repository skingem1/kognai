/**
 * SCORE — Scoring and Reputation for Agent Outputs
 * Core implementation: rubric, evaluate, reputation, audit
 * @version 0.2.0
 */

import { createHmac, randomUUID } from 'node:crypto';
import type {
  AgentId,
  AuditEntry,
  Criterion,
  Evaluation,
  Reputation,
  Rubric,
  Timestamp,
} from './types.js';

// ---------------------------------------------------------------------------
// Rubric creation
// ---------------------------------------------------------------------------

/**
 * Create a scoring rubric. Weights must sum to 1.0 (±0.001 tolerance).
 */
export function createRubric(
  name: string,
  criteria: Omit<Criterion, 'id'>[],
  options: { id?: string; version?: string } = {}
): Rubric {
  if (criteria.length === 0) throw new Error('Rubric must have at least one criterion');
  const weightSum = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(weightSum - 1.0) > 0.001) {
    throw new Error(`Criterion weights must sum to 1.0, got ${weightSum.toFixed(4)}`);
  }
  return {
    id: options.id ?? randomUUID(),
    name,
    version: options.version ?? '1.0',
    criteria: criteria.map((c) => ({ ...c, id: randomUUID() })),
  };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate an agent output against a rubric.
 * Scores must be 0.0–1.0 per criterion. Missing scores throw.
 *
 * @param rubric     The rubric to evaluate against
 * @param agentId    The agent whose output is being evaluated
 * @param outputRef  Reference to the specific output
 * @param scores     Map of criterion ID → score (0.0–1.0)
 * @param evaluatedBy  Who performed the evaluation
 * @param secret     Secret for signing the evaluation
 */
export function evaluate(
  rubric: Rubric,
  agentId: AgentId,
  outputRef: string,
  scores: Record<string, number>,
  evaluatedBy: AgentId | 'human',
  secret: string,
  options: { notes?: string } = {}
): Evaluation {
  // Validate all criteria have scores
  for (const criterion of rubric.criteria) {
    if (!(criterion.id in scores)) {
      throw new Error(`Missing score for criterion '${criterion.name}' (${criterion.id})`);
    }
    const s = scores[criterion.id];
    if (s < 0 || s > 1) {
      throw new Error(`Score for '${criterion.name}' must be 0.0–1.0, got ${s}`);
    }
  }

  // Weighted composite
  const compositeScore = rubric.criteria.reduce(
    (sum, c) => sum + scores[c.id] * c.weight,
    0
  );

  const id = randomUUID();
  const evaluatedAt = new Date().toISOString();

  // Sign the evaluation
  const payload = `${id}:${agentId}:${outputRef}:${compositeScore.toFixed(6)}:${evaluatedAt}`;
  const signature = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

  return {
    id,
    rubricId: rubric.id,
    agentId,
    outputRef,
    scores,
    compositeScore,
    evaluatedBy,
    evaluatedAt,
    signature,
    notes: options.notes,
  };
}

// ---------------------------------------------------------------------------
// Reputation calculation
// ---------------------------------------------------------------------------

/**
 * Calculate time-decayed reputation from a list of evaluations.
 *
 * Decay formula: weight = exp(-decay * ageDays)
 * Default decay rate: 0.01 (half-life ~69 days)
 *
 * @param agentId      Agent to calculate reputation for
 * @param evaluations  All evaluations for this agent (any agent IDs are filtered)
 * @param decayRate    Exponential decay rate per day (default: 0.01)
 * @param asOf         Timestamp to calculate age from (default: now)
 */
export function calculateReputation(
  agentId: AgentId,
  evaluations: Evaluation[],
  decayRate = 0.01,
  asOf?: Timestamp
): Reputation {
  const now = new Date(asOf ?? new Date().toISOString()).getTime();
  const relevant = evaluations.filter((e) => e.agentId === agentId);

  if (relevant.length === 0) {
    return {
      agentId,
      score: 0,
      evaluationCount: 0,
      lastEvaluatedAt: '',
      calculatedAt: new Date(now).toISOString(),
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let lastEvaluatedAt = '';

  for (const ev of relevant) {
    const ageDays = (now - new Date(ev.evaluatedAt).getTime()) / 86_400_000;
    const weight = Math.exp(-decayRate * Math.max(ageDays, 0));
    weightedSum += ev.compositeScore * weight;
    totalWeight += weight;
    if (ev.evaluatedAt > lastEvaluatedAt) lastEvaluatedAt = ev.evaluatedAt;
  }

  return {
    agentId,
    score: totalWeight > 0 ? weightedSum / totalWeight : 0,
    evaluationCount: relevant.length,
    lastEvaluatedAt,
    calculatedAt: new Date(now).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

/**
 * Create an audit entry from an evaluation.
 * These should be appended to an append-only log.
 */
export function createAuditEntry(
  evaluation: Evaluation,
  secret: string
): AuditEntry {
  const payload = `audit:${evaluation.id}:${evaluation.agentId}:${evaluation.compositeScore.toFixed(6)}:${evaluation.evaluatedAt}`;
  const signature = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return {
    evaluationId: evaluation.id,
    agentId: evaluation.agentId,
    compositeScore: evaluation.compositeScore,
    timestamp: evaluation.evaluatedAt,
    signature,
  };
}
