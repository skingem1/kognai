/**
 * SOUL — Constitutional Constraints and Safety
 * Public API surface
 * @version 0.2.0
 *
 * SOUL is the lowest protocol layer. No other protocol overrides it.
 * Kill switches are non-negotiable and cannot be delegated away.
 */

// Types
export type {
  AgentId,
  Timestamp,
  Signature,
  EnforcementLevel,
  ConstraintAction,
  Constraint,
  KillSwitch,
  Constitution,
  EvaluationResult,
  AuditEntry,
} from './types.js';

// Engine
export {
  createConstitution,
  signConstitution,
  evaluateAction,
  checkKillSwitches,
  createAudit,
} from './engine.js';

/** Protocol version constant */
export const SOUL_VERSION = '0.2' as const;
