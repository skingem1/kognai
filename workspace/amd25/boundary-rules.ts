/**
 * AMD-25 — Knowledge Boundary Rules + Constitutional Retrieval Filters
 * Sprint 959 — Design only, no implementation
 *
 * Defines access control rules between agents and domain knowledge stores,
 * plus constitutional filters applied at retrieval time.
 */

import type { DomainId, AgentId, Classification, DKAVector, DKAResult } from './dka-schema';

// ---------------------------------------------------------------------------
// Boundary Rules
// ---------------------------------------------------------------------------

/**
 * A boundary rule controls whether an agent can access knowledge
 * in a specific domain at a specific classification level.
 */
export interface BoundaryRule {
  /** Rule ID */
  id: string;
  /** Agent pattern (exact ID or glob like 'scs001-*') */
  agentPattern: string;
  /** Domain this rule applies to */
  domain: DomainId;
  /** Maximum classification level this agent can access */
  maxClassification: Classification;
  /** Whether the agent can write to this domain */
  canWrite: boolean;
  /** Whether results must pass constitutional filter before delivery */
  requireConstitutionalFilter: boolean;
  /** Optional: deny access entirely (overrides everything) */
  deny?: boolean;
}

/**
 * Classification hierarchy for comparison.
 * Higher index = more restricted.
 */
export const CLASSIFICATION_HIERARCHY: Classification[] = [
  'public',
  'internal',
  'restricted',
  'confidential',
];

/**
 * Check if an agent's clearance level can access a given classification.
 */
export function canAccess(
  _agentMaxClassification: Classification,
  _vectorClassification: Classification,
): boolean {
  throw new Error('canAccess: not implemented — design phase');
}

// ---------------------------------------------------------------------------
// Constitutional Retrieval Filters
// ---------------------------------------------------------------------------

/**
 * A constitutional filter that is applied to retrieval results
 * before they are returned to the requesting agent.
 */
export interface ConstitutionalFilter {
  /** Filter ID */
  id: string;
  /** Human-readable description */
  description: string;
  /** Which domains this filter applies to */
  domains: DomainId[];
  /** Filter type */
  type: 'redact' | 'block' | 'warn' | 'escalate';
  /** Pattern to match in source text (regex) */
  pattern: string;
  /** What to do when the pattern matches */
  action: {
    /** For 'redact': replacement text */
    replacement?: string;
    /** For 'escalate': which agent to notify */
    escalateTo?: AgentId;
    /** For 'warn': warning message to attach to result */
    warningMessage?: string;
  };
  /** Priority (lower = evaluated first) */
  priority: number;
  /** Whether this filter is immutable (cannot be overridden) */
  immutable: boolean;
}

/**
 * Default constitutional filters.
 * These are always active and cannot be disabled.
 */
export const DEFAULT_FILTERS: ConstitutionalFilter[] = [
  {
    id: 'cf-001-pii-redact',
    description: 'Redact personally identifiable information from all retrieval results',
    domains: ['trading', 'bizdev', 'research', 'content', 'regulatory'],
    type: 'redact',
    pattern: '\\b[A-Z][a-z]+ [A-Z][a-z]+\\b.*\\b\\d{3}-\\d{2}-\\d{4}\\b',
    action: { replacement: '[PII REDACTED]' },
    priority: 1,
    immutable: true,
  },
  {
    id: 'cf-002-insider-block',
    description: 'Block non-public financial data from unauthorized agents in trading domain',
    domains: ['trading'],
    type: 'block',
    pattern: '(insider|non-public|material.*information|MNPI)',
    action: {},
    priority: 2,
    immutable: true,
  },
  {
    id: 'cf-003-compliance-force',
    description: 'Always include relevant regulatory entries even at low confidence',
    domains: ['regulatory'],
    type: 'warn',
    pattern: '.*',
    action: { warningMessage: 'Regulatory content — verify with legal before acting' },
    priority: 10,
    immutable: true,
  },
  {
    id: 'cf-004-classification-escalate',
    description: 'Escalate to CEO when content appears misclassified (too low classification)',
    domains: ['trading', 'bizdev', 'regulatory'],
    type: 'escalate',
    pattern: '(confidential|secret|classified|restricted).*(?:public|internal)',
    action: { escalateTo: 'ceo' },
    priority: 5,
    immutable: true,
  },
];

/**
 * Apply constitutional filters to a set of retrieval results.
 * Returns filtered results with redactions, blocks, and warnings applied.
 */
export function applyConstitutionalFilters(
  _results: DKAResult[],
  _agent: AgentId,
  _filters: ConstitutionalFilter[],
): DKAResult[] {
  throw new Error('applyConstitutionalFilters: not implemented — design phase');
}

/**
 * Evaluate boundary rules for an agent querying a domain.
 * Returns the effective access level and constraints.
 */
export function evaluateBoundary(
  _agent: AgentId,
  _domain: DomainId,
  _rules: BoundaryRule[],
): {
  allowed: boolean;
  maxClassification: Classification;
  requireFilter: boolean;
  canWrite: boolean;
} {
  throw new Error('evaluateBoundary: not implemented — design phase');
}
