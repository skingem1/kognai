#!/usr/bin/env npx ts-node
/**
 * run-ab-analysis.ts — A/B test analysis for SCS-001 hook formulas + speakers
 * Sprint 660: Analyzes experiments.jsonl to rank hook formulas and speakers
 * by viral score. Updates hook optimizer weights. Produces analysis report.
 *
 * Usage: npx ts-node scripts/scs001/run-ab-analysis.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const EXPERIMENTS_PATH = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
const REPORT_PATH = path.join(ROOT, 'workspace', 'scs001', 'ab-analysis-report.json');
const WEIGHTS_PATH = path.join(ROOT, 'workspace', 'scs001', 'hook-weights.json');

interface Experiment {
  clip_id: string;
  hook_formula: string;
  speaker: string;
  qc_passed: boolean;
  partial_viral_score: number;
  run_id?: string;
  timestamp?: string;
}

interface FormulaStats {
  formula: string;
  count: number;
  avg_score: number;
  max_score: number;
  min_score: number;
  stddev: number;
  qc_pass_rate: number;
  weight: number;
  rank: number;
}

interface SpeakerStats {
  speaker: string;
  count: number;
  avg_score: number;
  max_score: number;
  qc_pass_rate: number;
  rank: number;
}

interface CrossStats {
  speaker: string;
  formula: string;
  count: number;
  avg_score: number;
}

function loadExperiments(): Experiment[] {
  if (!fs.existsSync(EXPERIMENTS_PATH)) return [];
  return fs.readFileSync(EXPERIMENTS_PATH, 'utf-8')
    .trim().split('\n').filter(l => l.trim())
    .map(l => JSON.parse(l));
}

function stddev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function analyzeFormulas(experiments: Experiment[]): FormulaStats[] {
  const groups: Record<string, Experiment[]> = {};
  for (const e of experiments) {
    const key = e.hook_formula || 'unknown';
    (groups[key] ??= []).push(e);
  }

  const stats: FormulaStats[] = Object.entries(groups).map(([formula, exps]) => {
    const scores = exps.map(e => e.partial_viral_score).filter(s => s != null);
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const qcPassed = exps.filter(e => e.qc_passed).length;
    return {
      formula,
      count: exps.length,
      avg_score: Math.round(avg * 1000) / 1000,
      max_score: scores.length > 0 ? Math.max(...scores) : 0,
      min_score: scores.length > 0 ? Math.min(...scores) : 0,
      stddev: Math.round(stddev(scores, avg) * 1000) / 1000,
      qc_pass_rate: Math.round((qcPassed / exps.length) * 100),
      weight: 0,
      rank: 0,
    };
  });

  // Sort by avg_score descending
  stats.sort((a, b) => b.avg_score - a.avg_score);

  // Assign ranks and weights
  const totalAvg = stats.reduce((s, f) => s + (f.count >= 3 ? f.avg_score : 0), 0);
  stats.forEach((f, i) => {
    f.rank = i + 1;
    // Weight = normalized avg score (min 10% for exploration)
    if (f.count >= 3 && totalAvg > 0) {
      f.weight = Math.max(0.10, Math.round((f.avg_score / totalAvg) * 100) / 100);
    } else {
      f.weight = 0.10; // Exploration weight for under-sampled formulas
    }
  });

  // Normalize weights to sum to 1
  const totalWeight = stats.reduce((s, f) => s + f.weight, 0);
  stats.forEach(f => { f.weight = Math.round((f.weight / totalWeight) * 100) / 100; });

  return stats;
}

function analyzeSpeakers(experiments: Experiment[]): SpeakerStats[] {
  const groups: Record<string, Experiment[]> = {};
  for (const e of experiments) {
    const key = e.speaker || 'unknown';
    (groups[key] ??= []).push(e);
  }

  const stats: SpeakerStats[] = Object.entries(groups)
    .filter(([, exps]) => exps.length >= 3) // Only speakers with 3+ experiments
    .map(([speaker, exps]) => {
      const scores = exps.map(e => e.partial_viral_score).filter(s => s != null);
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const qcPassed = exps.filter(e => e.qc_passed).length;
      return {
        speaker,
        count: exps.length,
        avg_score: Math.round(avg * 1000) / 1000,
        max_score: scores.length > 0 ? Math.max(...scores) : 0,
        qc_pass_rate: Math.round((qcPassed / exps.length) * 100),
        rank: 0,
      };
    });

  stats.sort((a, b) => b.avg_score - a.avg_score);
  stats.forEach((s, i) => { s.rank = i + 1; });

  return stats;
}

function analyzeCross(experiments: Experiment[]): CrossStats[] {
  const groups: Record<string, Experiment[]> = {};
  for (const e of experiments) {
    if (e.speaker === 'unknown' || e.hook_formula === 'unknown') continue;
    const key = `${e.speaker}|${e.hook_formula}`;
    (groups[key] ??= []).push(e);
  }

  return Object.entries(groups)
    .filter(([, exps]) => exps.length >= 3)
    .map(([key, exps]) => {
      const [speaker, formula] = key.split('|');
      const scores = exps.map(e => e.partial_viral_score).filter(s => s != null);
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return { speaker, formula, count: exps.length, avg_score: Math.round(avg * 1000) / 1000 };
    })
    .sort((a, b) => b.avg_score - a.avg_score);
}

function main(): void {
  console.log('=== SCS-001 A/B Test Analysis ===\n');

  const experiments = loadExperiments();
  if (experiments.length === 0) {
    console.log('No experiments found. Skipping analysis.');
    process.exit(0);
  }
  console.log(`Loaded ${experiments.length} experiments\n`);

  // Formula analysis
  const formulas = analyzeFormulas(experiments);
  console.log('--- Hook Formula Rankings ---');
  console.log('Rank | Formula         | Count | Avg Score | Max   | StdDev | QC%  | Weight');
  console.log('-----|-----------------|-------|-----------|-------|--------|------|-------');
  for (const f of formulas) {
    console.log(
      `  ${f.rank}  | ${f.formula.padEnd(15)} | ${String(f.count).padStart(5)} | ${f.avg_score.toFixed(3).padStart(9)} | ${f.max_score.toFixed(2).padStart(5)} | ${f.stddev.toFixed(3).padStart(6)} | ${String(f.qc_pass_rate).padStart(3)}% | ${f.weight.toFixed(2)}`
    );
  }

  // Speaker analysis
  const speakers = analyzeSpeakers(experiments);
  console.log('\n--- Speaker Rankings (3+ experiments) ---');
  console.log('Rank | Speaker                    | Count | Avg Score | Max   | QC%');
  console.log('-----|----------------------------|-------|-----------|-------|----');
  for (const s of speakers) {
    console.log(
      `  ${s.rank}  | ${s.speaker.padEnd(26)} | ${String(s.count).padStart(5)} | ${s.avg_score.toFixed(3).padStart(9)} | ${s.max_score.toFixed(2).padStart(5)} | ${String(s.qc_pass_rate).padStart(3)}%`
    );
  }

  // Cross-analysis
  const cross = analyzeCross(experiments);
  if (cross.length > 0) {
    console.log('\n--- Top Speaker x Formula Combos (3+ experiments) ---');
    for (const c of cross.slice(0, 10)) {
      console.log(`  ${c.speaker} + ${c.formula}: avg ${c.avg_score.toFixed(3)} (n=${c.count})`);
    }
  }

  // Build weights map
  const weights: Record<string, number> = {};
  for (const f of formulas) {
    if (f.formula !== 'unknown') weights[f.formula] = f.weight;
  }

  // Save report
  const report = {
    generated_at: new Date().toISOString(),
    total_experiments: experiments.length,
    formula_rankings: formulas,
    speaker_rankings: speakers,
    cross_analysis: cross.slice(0, 20),
    recommended_weights: weights,
    summary: {
      best_formula: formulas[0]?.formula ?? 'none',
      best_formula_score: formulas[0]?.avg_score ?? 0,
      best_speaker: speakers[0]?.speaker ?? 'none',
      best_speaker_score: speakers[0]?.avg_score ?? 0,
      best_combo: cross[0] ? `${cross[0].speaker} + ${cross[0].formula}` : 'none',
    },
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${REPORT_PATH}`);

  // Save weights
  fs.writeFileSync(WEIGHTS_PATH, JSON.stringify({ updated_at: new Date().toISOString(), weights }, null, 2));
  console.log(`Weights saved: ${WEIGHTS_PATH}`);

  console.log('\n✅ PASS — A/B analysis complete');
}

main();
