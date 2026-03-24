/**
 * SOUL — Constitutional Constraints and Safety
 * Public API surface (skeleton)
 * @version 0.1.0-skeleton
 *
 * IMPORTANT: SOUL is the lowest protocol layer. No other protocol overrides it.
 * Kill switches are non-negotiable and cannot be delegated away.
 */

export type {
  AgentId, Timestamp, Signature, EnforcementLevel, ConstraintAction,
  Constraint, KillSwitch, Constitution, EvaluationResult, AuditEntry,
} from './types.js';

export const SOUL_VERSION = '0.1' as const;

/** Load and validate a Constitution document */
export function loadConstitution(_raw: unknown): import('./types.js').Constitution {
  throw new Error('SOUL loadConstitution: not implemented — skeleton phase');
}

/** Evaluate an action against the loaded constitution */
export function evaluate(
  _constitution: import('./types.js').Constitution,
  _agentId: string,
  _action: string,
): import('./types.js').EvaluationResult {
  throw new Error('SOUL evaluate: not implemented — skeleton phase');
}

/** Check if any kill switch should be triggered */
export function checkKillSwitches(
  _constitution: import('./types.js').Constitution,
  _context: unknown,
): import('./types.js').KillSwitch | null {
  throw new Error('SOUL checkKillSwitches: not implemented — skeleton phase');
}
