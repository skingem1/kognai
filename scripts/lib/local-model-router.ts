/**
 * local-model-router.ts — Decides whether a task runs locally (Ollama) or
 * goes to the cloud (ClawRouter), and which local model to use.
 */

import { TaskType } from './model-router';
import { WalletState } from './wallet-state';

export type LocalTier = 'nano' | 'local' | 'power' | 'heavy';

export interface LocalRoute {
  model: string;
  tier: LocalTier;
}

const LOCAL_MODEL_MAP: Record<string, LocalRoute> = {
  // Nano tier — sub-second, ~120 tok/s
  classify:          { model: 'qwen3:0.6b',       tier: 'nano' },
  format:            { model: 'qwen3:0.6b',       tier: 'nano' },
  // Local tier — fast, ~60 tok/s
  summarize:         { model: 'qwen3:4b',         tier: 'local' },
  draft:             { model: 'qwen3:4b',         tier: 'local' },
  'codebase-scan':   { model: 'qwen3:4b',         tier: 'local' },
  // Power tier — workhorse, ~50 tok/s
  code:              { model: 'qwen3:14b',        tier: 'power' },
  content:           { model: 'qwen3:14b',        tier: 'power' },
  data:              { model: 'qwen3:14b',        tier: 'power' },
  lang:              { model: 'qwen3:14b',        tier: 'power' },
  audit:             { model: 'qwen3:14b',        tier: 'power' },
  util:              { model: 'qwen3:14b',        tier: 'power' },
  'agent-framework': { model: 'qwen3:14b',        tier: 'power' },
  // Reasoning — deepseek-r1, ~40 tok/s
  reason:            { model: 'deepseek-r1:14b',  tier: 'power' },
  // Heavy tier — qwen3:32b, 20GB RAM, single-task only
  'refactor-complex': { model: 'qwen3:32b',       tier: 'heavy' },
};

interface Task {
  task_target?: string;
  task_type?: string;
  title?: string;
  priority?: string;
}

/**
 * Decide whether this task should run locally.
 * Priority: explicit task_target > wallet state > task complexity heuristic
 */
export function shouldRunLocally(task: Task, wallet: WalletState, sovereign: boolean = false): boolean {
  // Explicit override: sovereign mode or wallet frozen → everything local
  if (sovereign || wallet.isFrozen) return true;

  // Explicit task_target: local → always local
  if (task.task_target === 'local') return true;

  // Explicit cloud targets → never local (unless sovereign)
  if (task.task_target === 'cloud-exec' || task.task_target === 'cloud-post') return false;

  // Wallet degraded (≥80%) → push non-critical tasks local
  if (wallet.isDegraded) {
    const taskType = (task.task_type || '').toLowerCase();
    const nonCritical: string[] = ['util', 'content', 'data', 'summarize', 'draft', 'codebase-scan'];
    if (nonCritical.includes(taskType)) return true;
    if (task.priority !== 'critical' && task.priority !== 'high') return true;
  }

  return false;
}

/**
 * Select the local Ollama model for a given task type.
 * Falls back to qwen3:14b (the always-loaded workhorse) if unknown type.
 */
export function selectLocalModel(taskType: string): LocalRoute {
  return LOCAL_MODEL_MAP[taskType] || LOCAL_MODEL_MAP['code'];
}
