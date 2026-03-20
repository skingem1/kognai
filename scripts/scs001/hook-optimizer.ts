/**
 * SCS-001 Hook Optimization Engine
 *
 * Analyzes experiments.jsonl to rank hook formulas by viral score performance.
 * Provides weighted random selection favoring top-performing formulas.
 *
 * Features:
 *   - Per-formula stats: avg, max, min, count, stddev
 *   - Weighted selection: top formulas get proportionally more picks
 *   - Exploration bonus: new/rare formulas get minimum 10% selection chance
 *   - Speaker-formula cross-analysis: which speakers work best with which hooks
 *
 * Usage:
 *   const { getOptimalHookFormula, getFormulaRankings } = require('./hook-optimizer');
 *   const formula = getOptimalHookFormula();  // weighted random pick
 *   const rankings = getFormulaRankings();    // sorted stats array
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ── Types ─────────────────────────────────────────────

export interface FormulaStats {
  formula: string;
  count: number;
  avg_score: number;
  max_score: number;
  min_score: number;
  stddev: number;
  weight: number; // Selection weight (0-1)
  rank: number;
}

export interface SpeakerFormulaStats {
  speaker: string;
  formula: string;
  count: number;
  avg_score: number;
}

interface ExperimentEntry {
  clip_id?: string;
  hook_formula?: string;
  speaker?: string;
  partial_viral_score?: number;
  qc_passed?: boolean;
}

// ── Config ─────────────────────────────────────────────

const ROOT = join(__dirname, "..", "..");
const EXPERIMENTS_PATH = join(ROOT, "workspace", "scs001", "experiments.jsonl");
const EXPLORATION_BONUS = 0.10; // Minimum 10% weight for rare formulas
const MIN_SAMPLES = 3; // Need at least 3 experiments before trusting a formula's stats

// All known hook formulas (including Sprint 443 additions)
const ALL_FORMULAS = [
  "curiosity_gap",
  "contrarian",
  "authority",
  "secret",
  "story",
  "question",
  "urgency",
  "proof",
];

// ── Data Loading ──────────────────────────────────────

function loadExperiments(): ExperimentEntry[] {
  if (!existsSync(EXPERIMENTS_PATH)) return [];

  const entries: ExperimentEntry[] = [];
  try {
    const lines = readFileSync(EXPERIMENTS_PATH, "utf-8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch { /* skip malformed */ }
    }
  } catch { /* file read error */ }

  return entries;
}

// ── Stats Computation ─────────────────────────────────

function computeStats(experiments: ExperimentEntry[]): Map<string, FormulaStats> {
  const groups = new Map<string, number[]>();

  for (const exp of experiments) {
    const formula = exp.hook_formula ?? "unknown";
    const score = exp.partial_viral_score ?? 0;
    if (!groups.has(formula)) groups.set(formula, []);
    groups.get(formula)!.push(score);
  }

  // Ensure all known formulas appear (even with 0 data)
  for (const f of ALL_FORMULAS) {
    if (!groups.has(f)) groups.set(f, []);
  }

  const statsMap = new Map<string, FormulaStats>();
  const allAvgs: number[] = [];

  for (const [formula, scores] of groups) {
    if (formula === "unknown") continue;

    const count = scores.length;
    const avg = count > 0 ? scores.reduce((a, b) => a + b, 0) / count : 0;
    const max = count > 0 ? Math.max(...scores) : 0;
    const min = count > 0 ? Math.min(...scores) : 0;
    const variance = count > 1
      ? scores.reduce((sum, s) => sum + (s - avg) ** 2, 0) / (count - 1)
      : 0;
    const stddev = Math.sqrt(variance);

    statsMap.set(formula, {
      formula,
      count,
      avg_score: Math.round(avg * 1000) / 1000,
      max_score: Math.round(max * 1000) / 1000,
      min_score: Math.round(min * 1000) / 1000,
      stddev: Math.round(stddev * 1000) / 1000,
      weight: 0, // computed below
      rank: 0,
    });

    if (count >= MIN_SAMPLES) allAvgs.push(avg);
  }

  // Compute weights: softmax-like weighting based on avg score
  const maxAvg = allAvgs.length > 0 ? Math.max(...allAvgs) : 1;
  const minAvg = allAvgs.length > 0 ? Math.min(...allAvgs) : 0;
  const range = maxAvg - minAvg || 1;

  let totalWeight = 0;
  for (const [, stats] of statsMap) {
    if (stats.count >= MIN_SAMPLES) {
      // Normalize score to 0-1 range, then apply softmax-like scaling
      const normalized = (stats.avg_score - minAvg) / range;
      stats.weight = Math.max(EXPLORATION_BONUS, normalized);
    } else {
      // Exploration bonus for rare/new formulas
      stats.weight = EXPLORATION_BONUS;
    }
    totalWeight += stats.weight;
  }

  // Normalize weights to sum to 1
  if (totalWeight > 0) {
    for (const [, stats] of statsMap) {
      stats.weight = Math.round((stats.weight / totalWeight) * 1000) / 1000;
    }
  }

  // Assign ranks
  const sorted = [...statsMap.values()].sort((a, b) => b.avg_score - a.avg_score);
  sorted.forEach((s, i) => { s.rank = i + 1; });

  return statsMap;
}

// ── Public API ─────────────────────────────────────────

/**
 * Get ranked formula stats sorted by average viral score (descending).
 */
export function getFormulaRankings(): FormulaStats[] {
  const experiments = loadExperiments();
  const statsMap = computeStats(experiments);
  return [...statsMap.values()].sort((a, b) => b.avg_score - a.avg_score);
}

/**
 * Select a hook formula using weighted random selection.
 * Top-performing formulas are selected more often, but rare/new formulas
 * always have at least EXPLORATION_BONUS chance of being picked.
 */
export function getOptimalHookFormula(): string {
  const rankings = getFormulaRankings();
  if (rankings.length === 0) {
    return ALL_FORMULAS[Math.floor(Math.random() * ALL_FORMULAS.length)];
  }

  // Weighted random selection
  const rand = Math.random();
  let cumulative = 0;
  for (const stats of rankings) {
    cumulative += stats.weight;
    if (rand <= cumulative) return stats.formula;
  }

  return rankings[0].formula;
}

/**
 * Get best speaker-formula combinations.
 */
export function getSpeakerFormulaCross(): SpeakerFormulaStats[] {
  const experiments = loadExperiments();
  const groups = new Map<string, { scores: number[]; speaker: string; formula: string }>();

  for (const exp of experiments) {
    const key = `${exp.speaker ?? "unknown"}|${exp.hook_formula ?? "unknown"}`;
    if (!groups.has(key)) {
      groups.set(key, { scores: [], speaker: exp.speaker ?? "unknown", formula: exp.hook_formula ?? "unknown" });
    }
    groups.get(key)!.scores.push(exp.partial_viral_score ?? 0);
  }

  return [...groups.values()]
    .filter((g) => g.scores.length >= 2 && g.formula !== "unknown")
    .map((g) => ({
      speaker: g.speaker,
      formula: g.formula,
      count: g.scores.length,
      avg_score: Math.round((g.scores.reduce((a, b) => a + b, 0) / g.scores.length) * 1000) / 1000,
    }))
    .sort((a, b) => b.avg_score - a.avg_score);
}

/**
 * Format rankings as a human-readable summary string.
 */
export function formatRankings(): string {
  const rankings = getFormulaRankings();
  const cross = getSpeakerFormulaCross().slice(0, 5);

  const lines: string[] = [
    "🎣 *Hook Formula Rankings*",
    "",
    "```",
    "Rank  Formula          Avg    Max    N   Weight",
    "─────────────────────────────────────────────────",
  ];

  for (const s of rankings) {
    const medal = s.rank <= 3 ? ["🥇", "🥈", "🥉"][s.rank - 1] : "  ";
    lines.push(
      `${medal} ${s.rank}.  ${s.formula.padEnd(16)} ${s.avg_score.toFixed(3)}  ${s.max_score.toFixed(3)}  ${String(s.count).padStart(3)}  ${(s.weight * 100).toFixed(0)}%`
    );
  }

  lines.push("```");

  if (cross.length > 0) {
    lines.push("", "*Top Speaker×Formula Combos:*");
    for (const c of cross) {
      lines.push(`  ${c.speaker} × ${c.formula}: ${c.avg_score.toFixed(3)} (${c.count} samples)`);
    }
  }

  lines.push("", `_Selection: weighted random (top formulas picked more often, 10% exploration floor)_`);

  return lines.join("\n");
}
