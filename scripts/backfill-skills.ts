#!/usr/bin/env ts-node
// AMD-02 SKILL BANK — P0-SKILL3 — Sprint backfill
// Usage: npx ts-node scripts/backfill-skills.ts [--dry-run]
// Scans all workspace/sprints/sprint-*.json, crystallises approved tasks into skill-bank/

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { crystalliseSkill } from './lib/skill-crystalliser';

const ROOT = join(__dirname, '..');
const SPRINTS_DIR = join(ROOT, 'workspace/sprints');
const DRY_RUN = process.argv.includes('--dry-run');

interface SprintTask {
  id: string;
  title?: string;
  type?: string;
  agent?: string;
  sprint_id?: string;
  status?: string;
  output?: {
    model?: string;
    review?: {
      verdict?: string;
      score?: number;
      strengths?: string[];
      issues?: Array<{ severity: string; description: string }>;
    };
  };
}

function inferTaskTarget(task: SprintTask): 'local' | 'cloud-code' {
  return (task as any).task_target === 'cloud-code' ? 'cloud-code' : 'local';
}

let crystallised = 0;
let skipped = 0;

const files = readdirSync(SPRINTS_DIR)
  .filter(f => f.startsWith('sprint-') && f.endsWith('.json'))
  .sort();

for (const file of files) {
  const sprintPath = join(SPRINTS_DIR, file);
  const sprintId = file.replace('.json', '');
  const { tasks } = JSON.parse(readFileSync(sprintPath, 'utf-8')) as { tasks: SprintTask[] };

  for (const task of (tasks || [])) {
    const score = task.output?.review?.score ?? 0;
    const verdict = task.output?.review?.verdict;
    if (verdict !== 'APPROVED' || score < 75) { skipped++; continue; }

    const keyPatterns = task.output?.review?.strengths?.slice(0, 5) ?? [];
    const antiPatterns = (task.output?.review?.issues ?? [])
      .filter(i => i.severity === 'high' || i.severity === 'critical')
      .map(i => i.description)
      .slice(0, 3);

    const params = {
      agentId: task.agent || 'unknown',
      taskId: task.id,
      sprintId: task.sprint_id || sprintId,
      taskTitle: task.title || task.id,
      taskType: task.type || 'feature',
      model: task.output?.model || 'qwen3:14b',
      taskTarget: inferTaskTarget(task),
      score,
      approachSummary: (task.title || task.id).substring(0, 200),
      keyPatterns,
      antiPatterns,
    };

    if (DRY_RUN) {
      console.log(`[DRY-RUN] Would crystallise: ${params.agentId}-${params.sprintId}-${params.taskId} (score: ${score})`);
      crystallised++;
    } else {
      const record = crystalliseSkill(params);
      if (record) { console.log(`✓ Crystallised: ${record.skill_id} (score: ${score})`); crystallised++; }
      else { skipped++; }
    }
  }
}

console.log(`\nBackfill complete: ${crystallised} crystallised, ${skipped} skipped (below threshold or already processed).`);
