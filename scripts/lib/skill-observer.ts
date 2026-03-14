// AMD-02 SKILL BANK — P0-SKILL4 — Skill capture observer
// Produces a coverage report: approved tasks vs. crystallised skill records
// Called from the daily report or manually: npx ts-node -e "require('./scripts/lib/skill-observer').reportSkillCoverage()"

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../..');
const SPRINTS_DIR = join(ROOT, 'workspace/sprints');
const SKILL_BANK_DIR = join(ROOT, 'skill-bank/kognai-owned');

export interface SkillCoverageReport {
  totalApproved: number;
  totalCrystallised: number;
  coveragePercent: number;
  uncapturedTaskIds: string[];
  crystallisedSkillIds: string[];
  generatedAt: string;
}

export function reportSkillCoverage(): SkillCoverageReport {
  const approvedTasks: { taskId: string; sprintId: string; score: number }[] = [];

  if (existsSync(SPRINTS_DIR)) {
    const files = readdirSync(SPRINTS_DIR)
      .filter(f => f.startsWith('sprint-') && f.endsWith('.json'))
      .sort();

    for (const file of files) {
      const sprintId = file.replace('.json', '');
      const { tasks } = JSON.parse(readFileSync(join(SPRINTS_DIR, file), 'utf-8')) as {
        tasks: Array<{ id: string; sprint_id?: string; output?: { review?: { verdict?: string; score?: number } } }>
      };
      for (const t of (tasks || [])) {
        const score = t.output?.review?.score ?? 0;
        if (t.output?.review?.verdict === 'APPROVED' && score >= 75) {
          approvedTasks.push({ taskId: t.id, sprintId: t.sprint_id || sprintId, score });
        }
      }
    }
  }

  const crystallisedSkillIds = existsSync(SKILL_BANK_DIR)
    ? readdirSync(SKILL_BANK_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))
    : [];

  // A task is 'captured' if any skill record's skill_id contains its taskId segment
  const uncapturedTaskIds = approvedTasks
    .filter(t => !crystallisedSkillIds.some(id => id.includes(t.taskId)))
    .map(t => `${t.sprintId}/${t.taskId}`);

  const coveragePercent = approvedTasks.length === 0
    ? 100
    : Math.round((crystallisedSkillIds.length / approvedTasks.length) * 100);

  const report: SkillCoverageReport = {
    totalApproved: approvedTasks.length,
    totalCrystallised: crystallisedSkillIds.length,
    coveragePercent,
    uncapturedTaskIds,
    crystallisedSkillIds,
    generatedAt: new Date().toISOString(),
  };

  console.log(`Skill Coverage: ${report.totalCrystallised}/${report.totalApproved} (${report.coveragePercent}%)`);
  if (report.uncapturedTaskIds.length > 0) {
    console.log(`Uncaptured (sample): ${report.uncapturedTaskIds.slice(0, 5).join(', ')}`);
  }
  return report;
}
