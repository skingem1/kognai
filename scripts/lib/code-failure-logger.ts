/**
 * Code Failure Logger — logs swarm code rejections to failure-library
 * Sprint 197 — task 197-01
 * Stdlib only: crypto, fs, path
 */

import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

export interface CodeFailureEntry {
  taskId: string;
  sprintId: string;
  agentId: string;
  attemptNum: number;
  score: number;
  model: string;
  rejectionReason: string;
  issues: Array<{ severity: string; file: string; description: string }>;
  failType: 'destructive_rewrite' | 'truncation' | 'qa_gate' | 'supervisor_rejected' | 'no_files';
}

const FAILURE_DIR = resolve(__dirname, '../../data/failure-library/code');

export function logCodeFailure(entry: CodeFailureEntry): void {
  try {
    mkdirSync(FAILURE_DIR, { recursive: true });

    const entryId = randomUUID().slice(0, 8);
    const record = {
      entry_id: entryId,
      task_id: entry.taskId,
      sprint_id: entry.sprintId,
      agent_id: entry.agentId,
      attempt_num: entry.attemptNum,
      score: entry.score,
      model: entry.model,
      fail_type: entry.failType,
      rejection_reason: entry.rejectionReason,
      issues: entry.issues,
      filed_at: new Date().toISOString(),
    };

    const filePath = join(FAILURE_DIR, `fail-${entryId}.json`);
    writeFileSync(filePath, JSON.stringify(record, null, 2));
  } catch {
    // Silently catch all errors — must not break the swarm
  }
}
