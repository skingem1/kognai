/**
 * task-contract-checker.ts — Sprint TICKET-005-RULE3
 * Rule 3 (Task Contracts): autonomous sprint proposals must declare
 * inputs, outputs, and success_criteria.
 *
 * This prevents vague "just implement something" briefs from reaching the coder.
 */

import type { SprintProposal } from '../lib/cto-approval-gate';

export interface TaskContractResult {
  valid: boolean;
  missing: string[];
}

const CONTRACT_FIELDS: Array<keyof SprintProposal> = [
  'inputs',
  'outputs',
  'success_criteria',
];

/**
 * Check that a sprint proposal includes all required contract fields.
 * Each field must be present and a non-empty array.
 */
export function checkTaskContracts(sprint: SprintProposal): TaskContractResult {
  const missing: string[] = [];

  for (const field of CONTRACT_FIELDS) {
    const value = sprint[field] as unknown;
    if (!Array.isArray(value) || (value as string[]).length === 0) {
      missing.push(field);
    }
  }

  return { valid: missing.length === 0, missing };
}
