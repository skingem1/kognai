#!/usr/bin/env ts-node
// AMD-07 CODE ASSET LIBRARY — Backfill script
// Usage: npx ts-node scripts/backfill-code-assets.ts [--dry-run]
// Scans all workspace/sprints/sprint-*.json, crystallises approved tasks into code_assets/

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { crystalliseCodeAsset } from './lib/code-asset-crystalliser';

const ROOT      = join(__dirname, '..');
const SPRINTS_DIR = join(ROOT, 'workspace/sprints');
const DRY_RUN   = process.argv.includes('--dry-run');

interface SprintTask {
  id:          string;
  title?:      string;
  type?:       string;
  agent?:      string;
  sprint_id?:  string;
  status?:     string;
  deliverables?: { code?: string[]; tests?: string[]; docs?: string[] };
  output?: {
    files?:  string[];
    model?:  string;
    review?: {
      verdict?: string;
      score?:   number;
    };
  };
}

let crystallised = 0;
let skipped      = 0;

const files = readdirSync(SPRINTS_DIR)
  .filter(f => f.startsWith('sprint-') && f.endsWith('.json'))
  .sort();

for (const file of files) {
  const sprintPath = join(SPRINTS_DIR, file);
  const sprintId   = file.replace('.json', '');
  const { tasks }  = JSON.parse(readFileSync(sprintPath, 'utf-8')) as { tasks: SprintTask[] };

  for (const task of (tasks || [])) {
    const score   = task.output?.review?.score ?? 0;
    const verdict = task.output?.review?.verdict;
    if (verdict !== 'APPROVED' || score < 75) { skipped++; continue; }

    // prefer output.files (actual written files); fallback to deliverables.code
    const taskFiles: string[] = task.output?.files?.length
      ? task.output.files
      : (task.deliverables?.code ?? []);

    if (taskFiles.length === 0) { skipped++; continue; }

    const params = {
      agentId:         task.agent || 'unknown',
      sprintId:        task.sprint_id || sprintId,
      taskId:          task.id,
      taskTitle:       task.title || task.id,
      files:           taskFiles,
      supervisorScore: score,
      origin:          'kognai-core' as const,
    };

    if (DRY_RUN) {
      // Check if any file is a lib/utils/agents/scripts path (eligibility preview)
      const eligible = taskFiles.filter(f =>
        /\/(lib|utils|helpers|agents)\//i.test(f) ||
        f.endsWith('.sql') ||
        (f.includes('/scripts/') && !f.includes('.test.'))
      );
      const note = eligible.length > 0 ? `→ ${eligible.length} eligible` : '→ SKIP (no lib files)';
      console.log(`[DRY-RUN] ${params.agentId}-${params.sprintId}-${params.taskId} (score: ${score}) ${note}`);
      if (eligible.length > 0) crystallised++;
      else skipped++;
    } else {
      const assetId = crystalliseCodeAsset(params);
      if (assetId) {
        console.log(`✓ Indexed: ${assetId}  ← ${params.sprintId}/${params.taskId} (score: ${score})`);
        crystallised++;
      } else {
        skipped++;
      }
    }
  }
}

console.log(`\nBackfill complete: ${crystallised} indexed, ${skipped} skipped (below threshold, no lib files, or already indexed).`);
