/**
 * SCORE — Scoring and Reputation for Agent Outputs
 * Public API surface (skeleton)
 * @version 0.1.0-skeleton
 */

export type {
  AgentId, Timestamp, Signature,
  Criterion, Rubric, Evaluation, Reputation, AuditEntry,
} from './types.js';

export const SCORE_VERSION = '0.1' as const;

export function evaluate(
  _agentId: string,
  _rubricId: string,
  _outputRef: string,
  _scores: Record<string, number>,
): import('./types.js').Evaluation {
  throw new Error('SCORE evaluate: not implemented — skeleton phase');
}

export function getReputation(_agentId: string): import('./types.js').Reputation {
  throw new Error('SCORE getReputation: not implemented — skeleton phase');
}
