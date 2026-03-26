/**
 * research-impl-gate.ts — Sprint TICKET-005-RULE2
 * Rule 2 (Research/Implementation Separation): blocks implementation sprints
 * from executing until their paired research sprint is marked done.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SprintProposal } from '../lib/cto-approval-gate';

export interface ResearchGateResult {
  allowed: boolean;
  reason: string;
}

/**
 * Check whether an implementation sprint's research prerequisite is done.
 * Returns allowed:true for non-implementation sprints or sprints without
 * a research_sprint_id.
 */
export function checkResearchGate(
  sprint: SprintProposal,
  projectRoot: string
): ResearchGateResult {
  if (sprint.phase !== 'implementation') {
    return { allowed: true, reason: 'Not an implementation sprint — no gate required.' };
  }

  if (!sprint.research_sprint_id) {
    return { allowed: true, reason: 'Implementation sprint has no research_sprint_id — gate skipped.' };
  }

  const researchId = sprint.research_sprint_id;

  // Check sprint-queue.json first (authoritative status)
  // Try both the raw ID and without the 'sprint-' prefix
  const queueIds = [researchId, researchId.replace(/^sprint-/, '')];
  const queueFile = path.join(projectRoot, 'workspace', 'sprint-queue.json');
  if (fs.existsSync(queueFile)) {
    try {
      const q = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
      const items: any[] = q.queue || q;
      const match = items.find((i: any) =>
        queueIds.includes(i.sprint_id || i.sprint || i.id || '')
      );
      if (match) {
        if (match.status === 'done') {
          return { allowed: true, reason: `Research sprint ${researchId} is done (queue).` };
        }
        return {
          allowed: false,
          reason: `Research sprint ${researchId} not done in queue (status: ${match.status || 'unknown'}).`,
        };
      }
    } catch { /* fall through */ }
  }

  // Fall back to workspace/sprints/{id}.json
  const sprintFile = path.join(projectRoot, 'workspace', 'sprints', `${researchId}.json`);
  if (fs.existsSync(sprintFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(sprintFile, 'utf-8'));
      if (data.status === 'done') {
        return { allowed: true, reason: `Research sprint ${researchId} is done.` };
      }
      if (data.status) {
        return {
          allowed: false,
          reason: `Research sprint ${researchId} not done (status: ${data.status}).`,
        };
      }
      // File exists but has no status — treat as not done
      return {
        allowed: false,
        reason: `Research sprint ${researchId} has no status field — treating as not done.`,
      };
    } catch { /* fall through */ }
  }

  // Research sprint not found anywhere — block by default
  return {
    allowed: false,
    reason: `Research sprint ${researchId} not found in sprints/ or sprint-queue.json.`,
  };
}
