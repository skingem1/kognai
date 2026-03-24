/**
 * SOUL — Constitutional Constraints and Safety
 * Core type definitions (skeleton)
 * @version 0.1.0-skeleton
 */

export type AgentId = string;
export type Timestamp = string;
export type Signature = string;

export type EnforcementLevel = 'hard' | 'soft' | 'advisory';
export type ConstraintAction = 'allow' | 'deny' | 'require';

/** A single constitutional constraint */
export interface Constraint {
  id: string;
  name: string;
  description: string;
  action: ConstraintAction;
  enforcementLevel: EnforcementLevel;
  /** Resource or action pattern this constraint covers */
  scope: string;
  /** Whether this constraint survives context compaction (must be bootstrapped) */
  bootstrapped: boolean;
}

/** A kill switch — a hard-stop trigger that halts an agent unconditionally */
export interface KillSwitch {
  id: string;
  name: string;
  /** Human-readable trigger condition */
  triggerCondition: string;
  /** What to do when triggered */
  action: 'halt' | 'pause' | 'alert';
  /** Cannot be delegated away or overridden */
  nonNegotiable: true;
}

/** The root constitutional document for an operator */
export interface Constitution {
  version: '0.1';
  operatorId: string;
  /** ISO 8601 */
  issuedAt: Timestamp;
  constraints: Constraint[];
  killSwitches: KillSwitch[];
  /** Operator's signature over the constitution */
  signature: Signature;
}

/** Result of evaluating an action against the constitution */
export interface EvaluationResult {
  allowed: boolean;
  constraintId: string | null;
  enforcementLevel: EnforcementLevel | null;
  reason: string;
  evaluatedAt: Timestamp;
}

/** Append-only audit log entry */
export interface AuditEntry {
  id: string;
  agentId: AgentId;
  action: string;
  evaluation: EvaluationResult;
  timestamp: Timestamp;
}
