#!/usr/bin/env npx ts-node
/**
 * aggregate-pipeline-metrics.ts — Sprint 268
 * Aggregates all pipeline run reports into a metrics summary.
 *
 * Reads reports/pipeline-runs/*.json, computes:
 * - Total runs, avg duration, success rate
 * - Per-stage avg time and throughput
 * - Videos produced per day trend
 * - QC pass rate
 *
 * Outputs: reports/pipeline-metrics.json (consumed by /metrics command)
 *
 * Usage: npx ts-node scripts/scs001/aggregate-pipeline-metrics.ts
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const RUNS_DIR = join(process.cwd(), 'reports', 'pipeline-runs');
const OUTPUT   = join(process.cwd(), 'reports', 'pipeline-metrics.json');

interface StageData {
  stage: string;
  agent: string;
  count: number;
  elapsed_ms: number;
  status: string;
}

interface RunReport {
  run_id: string;
  mode: string;
  started_at: string;
  completed_at?: string;
  total_elapsed_ms: number;
  stages: StageData[];
  summary?: {
    topics_found?: number;
    clips_discovered?: number;
    videos_edited?: number;
    videos_captioned?: number;
    qc_passed?: number;
    published?: number;
  };
  error_count?: number;
}

function loadRuns(): RunReport[] {
  if (!existsSync(RUNS_DIR)) return [];
  const files = readdirSync(RUNS_DIR)
    .filter(f => f.endsWith('.json') && f !== 'latest.json')
    .sort();

  const runs: RunReport[] = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(join(RUNS_DIR, f), 'utf-8'));
      if (raw.run_id && raw.stages) runs.push(raw);
    } catch { /* skip corrupt */ }
  }
  return runs;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function main(): void {
  const runs = loadRuns();
  if (runs.length === 0) {
    console.log('[metrics] No pipeline runs found.');
    return;
  }

  console.log(`\n══════════════════════════════════════════════`);
  console.log(`  Pipeline Metrics — ${runs.length} runs`);
  console.log(`══════════════════════════════════════════════\n`);

  // Overall stats
  const totalDurationMs = runs.reduce((s, r) => s + (r.total_elapsed_ms ?? 0), 0);
  const avgDurationMs = totalDurationMs / runs.length;
  const errorRuns = runs.filter(r => (r.error_count ?? 0) > 0).length;

  // Date range
  const dates = runs.map(r => r.started_at?.slice(0, 10)).filter(Boolean).sort();
  const firstDate = dates[0] ?? 'unknown';
  const lastDate = dates[dates.length - 1] ?? 'unknown';

  // Per-day stats
  const byDay = new Map<string, number>();
  for (const r of runs) {
    const day = r.started_at?.slice(0, 10);
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const runsPerDay = byDay.size > 0 ? (runs.length / byDay.size).toFixed(1) : '0';

  // Stage aggregation
  const stageStats = new Map<string, { totalMs: number; totalCount: number; runs: number }>();
  for (const r of runs) {
    for (const s of r.stages) {
      const existing = stageStats.get(s.stage) ?? { totalMs: 0, totalCount: 0, runs: 0 };
      existing.totalMs += s.elapsed_ms ?? 0;
      existing.totalCount += s.count ?? 0;
      existing.runs++;
      stageStats.set(s.stage, existing);
    }
  }

  // Summary aggregation
  let totalTopics = 0, totalClips = 0, totalEdited = 0, totalCaptioned = 0, totalQC = 0, totalPublished = 0;
  let summaryCount = 0;
  for (const r of runs) {
    if (!r.summary) continue;
    summaryCount++;
    totalTopics += r.summary.topics_found ?? 0;
    totalClips += r.summary.clips_discovered ?? 0;
    totalEdited += r.summary.videos_edited ?? 0;
    totalCaptioned += r.summary.videos_captioned ?? 0;
    totalQC += r.summary.qc_passed ?? 0;
    totalPublished += r.summary.published ?? 0;
  }

  const qcPassRate = totalCaptioned > 0 ? Math.round((totalQC / totalCaptioned) * 100) : 0;

  // Print report
  console.log(`  Period: ${firstDate} → ${lastDate}`);
  console.log(`  Total runs: ${runs.length} (${runsPerDay}/day avg)`);
  console.log(`  Avg duration: ${fmtMs(avgDurationMs)}`);
  console.log(`  Error runs: ${errorRuns}/${runs.length} (${Math.round(errorRuns / runs.length * 100)}%)`);
  console.log('');

  console.log('  *Stage Avg Times:*');
  const sortedStages = [...stageStats.entries()].sort((a, b) => {
    // Sort by stage number
    const numA = parseInt(a[0].match(/\d+/)?.[0] ?? '99', 10);
    const numB = parseInt(b[0].match(/\d+/)?.[0] ?? '99', 10);
    return numA - numB;
  });
  for (const [stage, stats] of sortedStages) {
    const avgMs = stats.totalMs / stats.runs;
    const avgCount = Math.round(stats.totalCount / stats.runs);
    console.log(`    ${stage}: ${fmtMs(avgMs)} avg (${avgCount} items/run)`);
  }

  console.log('');
  console.log('  *Cumulative Output:*');
  console.log(`    Topics found: ${totalTopics}`);
  console.log(`    Clips discovered: ${totalClips}`);
  console.log(`    Videos edited: ${totalEdited}`);
  console.log(`    Videos captioned: ${totalCaptioned}`);
  console.log(`    QC passed: ${totalQC} (${qcPassRate}% pass rate)`);
  console.log(`    Published: ${totalPublished}`);

  // Write JSON output
  const metricsOutput = {
    generated_at: new Date().toISOString(),
    period: { first: firstDate, last: lastDate },
    total_runs: runs.length,
    runs_per_day: parseFloat(runsPerDay),
    avg_duration_ms: Math.round(avgDurationMs),
    error_runs: errorRuns,
    stage_averages: Object.fromEntries(
      sortedStages.map(([stage, stats]) => [stage, {
        avg_ms: Math.round(stats.totalMs / stats.runs),
        avg_items: Math.round(stats.totalCount / stats.runs),
      }])
    ),
    cumulative: {
      topics_found: totalTopics,
      clips_discovered: totalClips,
      videos_edited: totalEdited,
      videos_captioned: totalCaptioned,
      qc_passed: totalQC,
      qc_pass_rate_pct: qcPassRate,
      published: totalPublished,
    },
    daily_runs: Object.fromEntries(byDay),
  };

  const dir = dirname(OUTPUT);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(metricsOutput, null, 2), 'utf-8');
  console.log(`\n  Written to: ${OUTPUT}`);
  console.log(`══════════════════════════════════════════════\n`);
}

main();
