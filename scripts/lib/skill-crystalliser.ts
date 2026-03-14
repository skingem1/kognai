// AMD-02 SKILL BANK — P0-SKILL2 — Skill crystallisation pipeline
// Called after each APPROVED task to distil execution into a reusable skill record
// Phase 1: write to skill-bank/kognai-owned/. Phase 3: expose via marketplace.

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../..');
const SKILL_BANK_DIR = join(ROOT, 'skill-bank/kognai-owned');

export interface SkillScoreEntry {
  sprint_id: string;
  task_id: string;
  score: number;
  reviewed_at: string;
}

export interface SkillRecord {
  skill_id: string;
  type: 'kognai-owned' | 'user-uploaded';
  name: string;
  description: string;
  definition: {
    approach: string;
    key_patterns: string[];
    anti_patterns: string[];
  };
  optimal_settings: {
    model: string;
    task_target: 'local' | 'cloud-code';
    max_attempts: number;
  };
  score_history: SkillScoreEntry[];
  execution_count: number;
  access_tier: 'internal' | 'free' | 'rental' | 'sale';
  source_sprint: string;
  source_task: string;
  agent_id: string;
  created_at: string;
  updated_at: string;
}

export interface CrystalliseParams {
  agentId: string;
  taskId: string;
  sprintId: string;
  taskTitle: string;
  taskType: string;
  model: string;
  taskTarget: 'local' | 'cloud-code';
  score: number;
  approachSummary: string;   // ≤ 200 chars — what approach the agent used
  keyPatterns: string[];     // max 5 — what worked
  antiPatterns: string[];    // max 3 — what to avoid
}

export function crystalliseSkill(params: CrystalliseParams): SkillRecord | null {
  if (params.score < 75) return null; // Only crystallise high-quality executions

  const slug = params.taskTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
  const skill_id = `${params.agentId}-${params.sprintId}-${slug}`;
  const now = new Date().toISOString();

  const skillPath = join(SKILL_BANK_DIR, `${skill_id}.json`);

  // If skill already exists, append score to history and update
  if (existsSync(skillPath)) {
    const existing: SkillRecord = JSON.parse(readFileSync(skillPath, 'utf-8'));
    existing.score_history.push({ sprint_id: params.sprintId, task_id: params.taskId, score: params.score, reviewed_at: now });
    existing.execution_count += 1;
    existing.updated_at = now;
    writeFileSync(skillPath, JSON.stringify(existing, null, 2), 'utf-8');
    return existing;
  }

  const record: SkillRecord = {
    skill_id,
    type: 'kognai-owned',
    name: params.taskTitle.substring(0, 60),
    description: params.approachSummary.substring(0, 200),
    definition: {
      approach: params.approachSummary,
      key_patterns: params.keyPatterns.slice(0, 5),
      anti_patterns: params.antiPatterns.slice(0, 3),
    },
    optimal_settings: {
      model: params.model,
      task_target: params.taskTarget,
      max_attempts: 3,
    },
    score_history: [{ sprint_id: params.sprintId, task_id: params.taskId, score: params.score, reviewed_at: now }],
    execution_count: 1,
    access_tier: 'internal',
    source_sprint: params.sprintId,
    source_task: params.taskId,
    agent_id: params.agentId,
    created_at: now,
    updated_at: now,
  };

  if (!existsSync(SKILL_BANK_DIR)) mkdirSync(SKILL_BANK_DIR, { recursive: true });
  writeFileSync(skillPath, JSON.stringify(record, null, 2), 'utf-8');
  return record;
}
