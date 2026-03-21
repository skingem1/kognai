/**
 * trust-score-updater.ts — Sprint 703 (GOV Phase 1)
 *
 * Dynamic ACP trust score updater. Adjusts scores based on real outcomes:
 * - Approved tasks (score >= 80): accuracy +1
 * - Rejected tasks: accuracy -2
 * - Safety flags: safety -3
 * - 5% daily decay toward 70 (mean) for stale agents
 *
 * Called by orchestrate-agents-v2.ts on both approval and rejection paths.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../..');
const TRUST_PATH = join(ROOT, 'acp', 'trust-scores.json');

interface AgentScores {
  safety: number;
  accuracy: number;
  brand_alignment: number;
  cultural_sensitivity: number;
  legal_compliance: number;
  composite: number;
  last_updated: string;
}

interface TrustData {
  version: string;
  updated: string;
  description: string;
  dimensions: Record<string, { weight: number; description: string }>;
  scores: Record<string, AgentScores>;
  thresholds: any;
  routing_rules: any[];
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function recomputeComposite(scores: AgentScores, dims: TrustData['dimensions']): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const [dim, config] of Object.entries(dims)) {
    const val = (scores as any)[dim];
    if (typeof val === 'number') {
      weighted += val * config.weight;
      totalWeight += config.weight;
    }
  }
  return totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
}

function loadTrustData(): TrustData {
  return JSON.parse(readFileSync(TRUST_PATH, 'utf-8'));
}

function saveTrustData(data: TrustData): void {
  data.updated = new Date().toISOString().slice(0, 10);
  writeFileSync(TRUST_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * Update trust scores after a task outcome.
 * @param agentId - The agent whose scores to update
 * @param outcome - 'approved' or 'rejected'
 * @param taskScore - The supervisor score (0-100)
 * @param safetyFlag - Whether a safety issue was flagged
 */
export function updateTrustScore(
  agentId: string,
  outcome: 'approved' | 'rejected',
  taskScore: number,
  safetyFlag: boolean = false,
): void {
  try {
    const data = loadTrustData();
    const scores = data.scores[agentId];
    if (!scores) {
      console.warn(`[trust-updater] Agent '${agentId}' not in trust-scores.json — skipping`);
      return;
    }

    if (outcome === 'approved' && taskScore >= 80) {
      scores.accuracy = clamp(scores.accuracy + 1, 0, 100);
    } else if (outcome === 'rejected') {
      scores.accuracy = clamp(scores.accuracy - 2, 0, 100);
    }

    if (safetyFlag) {
      scores.safety = clamp(scores.safety - 3, 0, 100);
    }

    scores.composite = recomputeComposite(scores, data.dimensions);
    scores.last_updated = new Date().toISOString().slice(0, 10);

    saveTrustData(data);
  } catch (err: any) {
    // Non-fatal — trust score update failure should never block execution
    console.warn(`[trust-updater] Failed to update scores: ${err.message}`);
  }
}

/**
 * Apply daily decay: stale agents drift 5% toward mean (70) per day.
 * Run once per day (e.g., in daily-digest or a cron).
 */
export function applyDailyDecay(): void {
  try {
    const data = loadTrustData();
    const MEAN = 70;
    const DECAY_RATE = 0.05;
    const today = new Date().toISOString().slice(0, 10);

    for (const [agentId, scores] of Object.entries(data.scores)) {
      if (scores.last_updated === today) continue; // Active today, skip

      for (const dim of ['safety', 'accuracy', 'brand_alignment', 'cultural_sensitivity', 'legal_compliance'] as const) {
        const current = scores[dim];
        const diff = current - MEAN;
        scores[dim] = Math.round(current - diff * DECAY_RATE);
      }
      scores.composite = recomputeComposite(scores, data.dimensions);
    }

    saveTrustData(data);
  } catch (err: any) {
    console.warn(`[trust-updater] Daily decay failed: ${err.message}`);
  }
}
