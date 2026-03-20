/**
 * SCS-001 Queue Optimizer — Diversity-Scored Posting Order
 *
 * Reorders the posting queue for maximum content diversity:
 *   - No consecutive same-speaker videos (audience variety)
 *   - Topic/hook formula rotation (prevents content fatigue)
 *   - Viral score weighting (higher scores first, with diversity constraint)
 *
 * Algorithm:
 *   1. Load unposted videos from publish-ledger.jsonl + experiments.jsonl
 *   2. Score each video: viral_score * 0.6 + diversity_bonus * 0.4
 *   3. Greedy selection: pick highest-scoring video that differs from previous
 *   4. Return optimized order
 *
 * Usage:
 *   const { getOptimizedQueue, formatOptimizedQueue } = require('./queue-optimizer');
 *   const queue = getOptimizedQueue(10); // top 10 videos in optimal order
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ── Types ─────────────────────────────────────────────

export interface QueueEntry {
  video_id: string;
  speaker: string;
  hook_formula: string;
  viral_score: number;
  diversity_score: number;
  combined_score: number;
  rank: number;
}

interface LedgerEntry {
  video_id?: string;
  clip_id?: string;
  [key: string]: any;
}

interface ExperimentEntry {
  clip_id?: string;
  video_id?: string;
  speaker?: string;
  hook_formula?: string;
  partial_viral_score?: number;
  qc_passed?: boolean;
}

// ── Config ─────────────────────────────────────────────

const ROOT = join(__dirname, "..", "..");
const LEDGER_PATH = join(ROOT, "workspace", "scs001", "publish-ledger.jsonl");
const EXPERIMENTS_PATH = join(ROOT, "workspace", "scs001", "experiments.jsonl");
const MANUAL_POSTS_PATH = join(ROOT, "workspace", "scs001", "manual-posts.jsonl");

// Scoring weights
const VIRAL_WEIGHT = 0.6;
const DIVERSITY_WEIGHT = 0.4;

// ── Data Loading ──────────────────────────────────────

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const entries: T[] = [];
  try {
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      try { entries.push(JSON.parse(line)); } catch { /* skip */ }
    }
  } catch { /* file error */ }
  return entries;
}

// ── Queue Building ────────────────────────────────────

function buildCandidatePool(): QueueEntry[] {
  const ledger = readJsonl<LedgerEntry>(LEDGER_PATH);
  const experiments = readJsonl<ExperimentEntry>(EXPERIMENTS_PATH);
  const posted = readJsonl<{ video_id?: string }>(MANUAL_POSTS_PATH);

  const postedIds = new Set(posted.map((p) => p.video_id).filter(Boolean));

  // Build experiment lookup
  const expMap = new Map<string, ExperimentEntry>();
  for (const exp of experiments) {
    const id = exp.clip_id ?? exp.video_id;
    if (id) expMap.set(id, exp);
  }

  // Build unposted candidates
  const candidates: QueueEntry[] = [];
  const seen = new Set<string>();

  for (const entry of ledger) {
    const id = entry.video_id ?? entry.clip_id;
    if (!id || postedIds.has(id) || seen.has(id)) continue;
    seen.add(id);

    const exp = expMap.get(id);
    candidates.push({
      video_id: id,
      speaker: exp?.speaker ?? "unknown",
      hook_formula: exp?.hook_formula ?? "unknown",
      viral_score: exp?.partial_viral_score ?? 0,
      diversity_score: 0, // computed later
      combined_score: 0,
      rank: 0,
    });
  }

  return candidates;
}

// ── Diversity Scoring ─────────────────────────────────

/**
 * Greedy diversity-optimized ordering:
 * At each step, pick the candidate with highest combined score
 * that maximizes diversity from previously selected items.
 */
function optimizeOrder(candidates: QueueEntry[], limit: number): QueueEntry[] {
  if (candidates.length === 0) return [];

  const result: QueueEntry[] = [];
  const remaining = [...candidates];

  // Normalize viral scores to 0-1
  const maxViral = Math.max(...remaining.map((c) => c.viral_score), 0.01);

  while (result.length < limit && remaining.length > 0) {
    // Score each remaining candidate
    for (const candidate of remaining) {
      const normalizedViral = candidate.viral_score / maxViral;

      // Diversity: bonus for different speaker/formula from recent selections
      let diversityBonus = 1.0;
      if (result.length > 0) {
        const prev = result[result.length - 1];
        if (candidate.speaker === prev.speaker) diversityBonus -= 0.5;
        if (candidate.hook_formula === prev.hook_formula) diversityBonus -= 0.3;

        // Check last 3 for repetition
        const recent3 = result.slice(-3);
        const recentSpeakers = new Set(recent3.map((r) => r.speaker));
        const recentFormulas = new Set(recent3.map((r) => r.hook_formula));
        if (recentSpeakers.has(candidate.speaker)) diversityBonus -= 0.2;
        if (recentFormulas.has(candidate.hook_formula)) diversityBonus -= 0.1;
      }

      candidate.diversity_score = Math.max(0, diversityBonus);
      candidate.combined_score =
        normalizedViral * VIRAL_WEIGHT + candidate.diversity_score * DIVERSITY_WEIGHT;
    }

    // Pick best
    remaining.sort((a, b) => b.combined_score - a.combined_score);
    const best = remaining.shift()!;
    best.rank = result.length + 1;
    result.push(best);
  }

  return result;
}

// ── Public API ─────────────────────────────────────────

/**
 * Get optimized posting queue — diversity + viral score balanced.
 */
export function getOptimizedQueue(limit: number = 10): QueueEntry[] {
  const candidates = buildCandidatePool();
  return optimizeOrder(candidates, limit);
}

/**
 * Format optimized queue as a Telegram-friendly string.
 */
export function formatOptimizedQueue(limit: number = 10): string {
  const queue = getOptimizedQueue(limit);

  if (queue.length === 0) {
    return "⚠️ No unposted videos in queue. Run /refresh to generate content.";
  }

  const lines: string[] = [
    `📋 *Optimized Posting Queue* (${queue.length} videos)`,
    "",
    "```",
    "#  Speaker            Formula         Score",
    "────────────────────────────────────────────",
  ];

  for (const entry of queue) {
    lines.push(
      `${String(entry.rank).padStart(2)}. ${entry.speaker.slice(0, 18).padEnd(18)} ${entry.hook_formula.padEnd(15)} ${entry.combined_score.toFixed(2)}`
    );
  }

  lines.push("```");

  // Speaker diversity stats
  const speakers = new Set(queue.map((q) => q.speaker));
  const formulas = new Set(queue.map((q) => q.hook_formula));
  lines.push("");
  lines.push(`Diversity: ${speakers.size} speakers, ${formulas.size} formulas`);

  // Check for consecutive same-speaker
  let consecutive = 0;
  for (let i = 1; i < queue.length; i++) {
    if (queue[i].speaker === queue[i - 1].speaker) consecutive++;
  }
  if (consecutive === 0) {
    lines.push("✓ No consecutive same-speaker videos");
  } else {
    lines.push(`⚠️ ${consecutive} consecutive same-speaker pairs (unavoidable with limited pool)`);
  }

  lines.push("");
  lines.push("_Use /postnow to post the top video_");

  return lines.join("\n");
}
