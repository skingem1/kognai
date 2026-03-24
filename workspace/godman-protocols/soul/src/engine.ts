/**
 * SOUL — Constitutional Constraints and Safety
 * Core engine: constitution creation, evaluation, kill switches, audit
 * @version 0.2.0
 *
 * SOUL is the lowest protocol layer. No other protocol overrides it.
 * Kill switches are non-negotiable and cannot be delegated away.
 */

import { createHmac, randomUUID } from 'node:crypto';
import type {
  AgentId,
  AuditEntry,
  Constraint,
  ConstraintAction,
  Constitution,
  EnforcementLevel,
  EvaluationResult,
  KillSwitch,
  Timestamp,
} from './types.js';

// ---------------------------------------------------------------------------
// Constitution creation
// ---------------------------------------------------------------------------

/**
 * Create a Constitution document.
 * Must be signed by the operator before use.
 */
export function createConstitution(
  operatorId: string,
  constraints: Omit<Constraint, 'id'>[],
  killSwitches: Omit<KillSwitch, 'id' | 'nonNegotiable'>[],
  options: { issuedAt?: Timestamp } = {}
): Omit<Constitution, 'signature'> & { signature: '' } {
  return {
    version: '0.1',
    operatorId,
    issuedAt: options.issuedAt ?? new Date().toISOString(),
    constraints: constraints.map((c) => ({ ...c, id: randomUUID() })),
    killSwitches: killSwitches.map((k) => ({
      ...k,
      id: randomUUID(),
      nonNegotiable: true as const,
    })),
    signature: '',
  };
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Sign a constitution with the operator's secret.
 */
export function signConstitution(
  constitution: Constitution,
  operatorSecret: string
): Constitution {
  const payload = JSON.stringify({
    version: constitution.version,
    operatorId: constitution.operatorId,
    issuedAt: constitution.issuedAt,
    constraintCount: constitution.constraints.length,
    killSwitchCount: constitution.killSwitches.length,
  });
  const signature = createHmac('sha256', operatorSecret)
    .update(payload, 'utf8')
    .digest('hex');
  return { ...constitution, signature };
}

// ---------------------------------------------------------------------------
// Scope matching
// ---------------------------------------------------------------------------

/**
 * Match an action string against a scope pattern.
 * Supports:
 * - Exact match: 'read:workspace/scs001'
 * - Wildcard: 'read:*', '*:workspace/*', '*'
 * - Prefix: 'read:workspace/*' matches 'read:workspace/scs001/file.ts'
 */
function scopeMatches(pattern: string, action: string): boolean {
  if (pattern === '*') return true;
  if (pattern === action) return true;
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return action.startsWith(prefix);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate an action against the constitution.
 *
 * Matching order:
 * 1. Check 'deny' constraints first (deny wins over allow)
 * 2. Check 'require' constraints (must have a matching allow)
 * 3. Check 'allow' constraints
 * 4. Default: deny (constitutional principle — deny by default)
 */
export function evaluateAction(
  constitution: Constitution,
  agentId: AgentId,
  action: string
): EvaluationResult {
  const now = new Date().toISOString();

  // Check deny constraints first
  for (const c of constitution.constraints) {
    if (c.action === 'deny' && scopeMatches(c.scope, action)) {
      return {
        allowed: false,
        constraintId: c.id,
        enforcementLevel: c.enforcementLevel,
        reason: `Denied by constraint '${c.name}': ${c.description}`,
        evaluatedAt: now,
      };
    }
  }

  // Check allow constraints
  for (const c of constitution.constraints) {
    if (c.action === 'allow' && scopeMatches(c.scope, action)) {
      return {
        allowed: true,
        constraintId: c.id,
        enforcementLevel: c.enforcementLevel,
        reason: `Allowed by constraint '${c.name}'`,
        evaluatedAt: now,
      };
    }
  }

  // Default deny
  return {
    allowed: false,
    constraintId: null,
    enforcementLevel: 'hard',
    reason: 'No matching allow constraint — denied by default (constitutional principle)',
    evaluatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Kill switches
// ---------------------------------------------------------------------------

/**
 * Check kill switch conditions against context.
 * Context is a key-value map of runtime metrics.
 *
 * Trigger condition format: "key operator value"
 * Supported operators: >, <, >=, <=, ==, !=
 * Example: "views_per_30_posts < 500", "memory_gb > 22"
 */
export function checkKillSwitches(
  constitution: Constitution,
  context: Record<string, number | string | boolean>
): KillSwitch | null {
  for (const ks of constitution.killSwitches) {
    const parts = ks.triggerCondition.split(/\s+/);
    if (parts.length !== 3) continue;
    const [key, op, rawVal] = parts as [string, string, string];
    if (!(key in context)) continue;
    const actual = Number(context[key]);
    const threshold = Number(rawVal);
    if (isNaN(actual) || isNaN(threshold)) continue;

    let triggered = false;
    switch (op) {
      case '>': triggered = actual > threshold; break;
      case '<': triggered = actual < threshold; break;
      case '>=': triggered = actual >= threshold; break;
      case '<=': triggered = actual <= threshold; break;
      case '==': triggered = actual === threshold; break;
      case '!=': triggered = actual !== threshold; break;
    }
    if (triggered) return ks;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/**
 * Create an audit entry from an evaluation result.
 */
export function createAudit(
  agentId: AgentId,
  action: string,
  evaluation: EvaluationResult
): AuditEntry {
  return {
    id: randomUUID(),
    agentId,
    action,
    evaluation,
    timestamp: evaluation.evaluatedAt,
  };
}
