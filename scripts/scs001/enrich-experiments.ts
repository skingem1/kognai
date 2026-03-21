#!/usr/bin/env npx ts-node
/**
 * SCS-001 Experiment Enrichment — Sprint 279
 *
 * Retroactively updates experiments.jsonl entries that have fallback viral scores (0.5)
 * by computing composite scores using hookQualityScore from hook-quality.ts.
 *
 * For each entry with partial_viral_score === 0.5:
 *   - Reads the video's script JSON (if available) to get hook text
 *   - Computes hookQualityScore(hookText, speaker)
 *   - Updates partial_viral_score = hookScore * 0.7 + 0.5 * 0.3
 *
 * Usage:
 *   npx ts-node scripts/scs001/enrich-experiments.ts
 *   ENRICH_DRY_RUN=1 npx ts-node scripts/scs001/enrich-experiments.ts
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { hookQualityScore } from './hook-quality';

const ROOT = resolve(__dirname, '..', '..');
const WORKSPACE = join(ROOT, 'workspace', 'scs001');
const EXP_PATH = join(WORKSPACE, 'experiments.jsonl');
const DRY_RUN = process.env.ENRICH_DRY_RUN === '1';

interface ExperimentEntry {
  clip_id: string;
  hook_formula: string;
  speaker: string;
  qc_passed: boolean;
  run_id: string;
  timestamp: string;
  partial_viral_score?: number;
  topic?: string;
  [key: string]: unknown;
}

function findScriptJson(videoId: string): any | null {
  try {
    // Check standard pipeline runs
    const runDirs = readdirSync(WORKSPACE).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const scriptDir = join(WORKSPACE, dir, 'script');
      if (!existsSync(scriptDir)) continue;
      const scriptFile = join(scriptDir, `${videoId}-script.json`);
      if (existsSync(scriptFile)) {
        return JSON.parse(readFileSync(scriptFile, 'utf-8'));
      }
    }
    // Sprint 615: Check multiformat script files (exp-*, dbt-*, vis-*, lst-*)
    const scriptsDir = join(WORKSPACE, 'scripts');
    if (existsSync(scriptsDir)) {
      const files = readdirSync(scriptsDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try {
          const data = JSON.parse(readFileSync(join(scriptsDir, f), 'utf-8'));
          if (data.topic_id === videoId || data.script_id === videoId) return data;
        } catch { /* skip */ }
      }
    }
  } catch { /* ignore */ }
  return null;
}

function main(): void {
  console.log(`=== Experiment Enrichment — Sprint 279 ===${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  if (!existsSync(EXP_PATH)) {
    console.log('No experiments.jsonl found.');
    return;
  }

  const lines = readFileSync(EXP_PATH, 'utf-8').split('\n').filter(l => l.trim());
  const entries: ExperimentEntry[] = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch { /* skip */ }
  }

  console.log(`Loaded: ${entries.length} experiment entries`);

  let updated = 0;
  let skipped = 0;

  for (const entry of entries) {
    // Only update entries with fallback score
    if (entry.partial_viral_score !== 0.5 && entry.partial_viral_score != null) {
      skipped++;
      continue;
    }

    // Try to find hook text from script JSON
    const script = findScriptJson(entry.clip_id);
    const hookText = script?.hook || script?.title || script?.headline || entry.topic || entry.hook_formula || '';
    const speaker = entry.speaker || '';

    // Sprint 615: Enrich format from script JSON or multiformat run
    if (!entry.format && script?.format) {
      entry.format = script.format;
    }

    // Use hookQualityScore if we have real text, otherwise formula-based scoring
    let computedScore: number;
    if (hookText && hookText !== entry.hook_formula) {
      computedScore = hookQualityScore(hookText, speaker);
    } else {
      // Formula-based scoring with speaker bonus
      const formulaScores: Record<string, number> = {
        curiosity_gap: 0.65,
        contrarian: 0.60,
        authority: 0.55,
        secret: 0.50,
        unknown: 0.30,
      };
      computedScore = formulaScores[entry.hook_formula] ?? 0.35;
      // Speaker bonus: known speakers get +0.1
      if (speaker && speaker !== 'unknown') computedScore += 0.1;
      // QC pass bonus
      if (entry.qc_passed) computedScore += 0.05;
      computedScore = Math.min(1.0, computedScore);
    }
    entry.partial_viral_score = Math.round((computedScore * 0.7 + 0.5 * 0.3) * 100) / 100;
    updated++;
  }

  console.log(`Updated: ${updated} entries`);
  console.log(`Skipped: ${skipped} entries (already have real scores)`);

  // Show score distribution
  const scores = entries.map(e => e.partial_viral_score ?? 0);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  console.log(`\nScore distribution: avg=${avg.toFixed(2)}, min=${min.toFixed(2)}, max=${max.toFixed(2)}`);

  if (DRY_RUN) {
    console.log('\n[DRY_RUN] Would rewrite experiments.jsonl. Skipping.');
    return;
  }

  // Backup and write
  const backupPath = EXP_PATH + '.bak';
  writeFileSync(backupPath, readFileSync(EXP_PATH));
  console.log(`Backup: ${backupPath}`);

  const output = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(EXP_PATH, output);
  console.log(`✅ Written ${entries.length} entries to experiments.jsonl`);
}

main();
