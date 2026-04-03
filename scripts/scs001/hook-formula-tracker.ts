#!/usr/bin/env npx ts-node
/**
 * Hook Formula Performance Tracker — SCS001-A Sprint 1505
 * Tracks which of the 9 hook formulas perform best (manual metric input).
 * Feeds SCS001 Part 12 iteration loop.
 *
 * Storage: workspace/scs001/hook-formula-metrics.json
 *
 * Usage:
 *   npx ts-node scripts/scs001/hook-formula-tracker.ts --report
 *   npx ts-node scripts/scs001/hook-formula-tracker.ts --recommend
 *   npx ts-node scripts/scs001/hook-formula-tracker.ts --add-metrics \
 *     --formula curiosity_gap \
 *     --retention3s 0.62 \
 *     --completion 0.38 \
 *     --comment-rate 0.04 \
 *     --video-id vlog-abc123
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..", "..");
const METRICS_FILE = path.join(ROOT, "workspace", "scs001", "hook-formula-metrics.json");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FormulaMetricEntry {
  video_id: string;
  formula_id: string;
  retention_3s: number;     // 0-1, % who stayed past 3s
  completion_rate: number;  // 0-1, % who watched to end
  comment_rate: number;     // 0-1, comments/views
  recorded_at: string;
}

export interface FormulaAggregate {
  formula_id: string;
  formula_name: string;
  sample_count: number;
  avg_retention_3s: number;
  avg_completion_rate: number;
  avg_comment_rate: number;
  composite_score: number;  // weighted: retention×0.5 + completion×0.3 + comment×0.2
}

export interface MetricsStore {
  entries: FormulaMetricEntry[];
  last_updated: string;
}

// ─── Formula Name Map ─────────────────────────────────────────────────────────

const FORMULA_NAMES: Record<string, string> = {
  curiosity_gap:   "Curiosity Gap",
  contrarian:      "Contrarian",
  specific_number: "Specific Number",
  relatable_pain:  "Relatable Pain",
  reveal_tease:    "Reveal Tease",
  direct_address:  "Direct Address",
  bold_claim:      "Bold Claim",
  story_start:     "Story Start",
  challenge:       "Challenge",
};

// ─── Store I/O ────────────────────────────────────────────────────────────────

function loadStore(): MetricsStore {
  try {
    return JSON.parse(fs.readFileSync(METRICS_FILE, "utf8")) as MetricsStore;
  } catch {
    return { entries: [], last_updated: new Date().toISOString() };
  }
}

function saveStore(store: MetricsStore): void {
  fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true });
  store.last_updated = new Date().toISOString();
  fs.writeFileSync(METRICS_FILE, JSON.stringify(store, null, 2));
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function addMetrics(entry: FormulaMetricEntry): void {
  const store = loadStore();
  store.entries.push(entry);
  saveStore(store);
  console.log(`[hook-tracker] Added metrics for ${entry.formula_id} (${entry.video_id})`);
  console.log(`  retention_3s=${entry.retention_3s} completion=${entry.completion_rate} comment=${entry.comment_rate}`);
}

function computeAggregates(entries: FormulaMetricEntry[]): FormulaAggregate[] {
  const grouped: Record<string, FormulaMetricEntry[]> = {};
  for (const e of entries) {
    if (!grouped[e.formula_id]) grouped[e.formula_id] = [];
    grouped[e.formula_id].push(e);
  }

  const aggs: FormulaAggregate[] = [];
  for (const [formulaId, items] of Object.entries(grouped)) {
    const n = items.length;
    const avgRetention = items.reduce((s, x) => s + x.retention_3s, 0) / n;
    const avgCompletion = items.reduce((s, x) => s + x.completion_rate, 0) / n;
    const avgComment = items.reduce((s, x) => s + x.comment_rate, 0) / n;
    const composite = avgRetention * 0.5 + avgCompletion * 0.3 + avgComment * 0.2;

    aggs.push({
      formula_id: formulaId,
      formula_name: FORMULA_NAMES[formulaId] ?? formulaId,
      sample_count: n,
      avg_retention_3s: parseFloat(avgRetention.toFixed(3)),
      avg_completion_rate: parseFloat(avgCompletion.toFixed(3)),
      avg_comment_rate: parseFloat(avgComment.toFixed(3)),
      composite_score: parseFloat(composite.toFixed(3)),
    });
  }

  return aggs.sort((a, b) => b.composite_score - a.composite_score);
}

function report(): void {
  const store = loadStore();
  if (!store.entries.length) {
    console.log("[hook-tracker] No metrics recorded yet. Use --add-metrics to start.");
    return;
  }

  const aggs = computeAggregates(store.entries);
  console.log(`\nHook Formula Performance Report (${store.entries.length} data points)\n`);
  console.log(
    `${"Rank".padEnd(5)} ${"Formula".padEnd(18)} ${"Samples".padEnd(8)} ${"Retention3s".padEnd(12)} ${"Completion".padEnd(11)} ${"Comment".padEnd(8)} ${"Composite"}`
  );
  console.log("─".repeat(80));
  aggs.forEach((a, i) => {
    console.log(
      `${String(i + 1).padEnd(5)} ${a.formula_name.padEnd(18)} ${String(a.sample_count).padEnd(8)} ${a.avg_retention_3s.toFixed(3).padEnd(12)} ${a.avg_completion_rate.toFixed(3).padEnd(11)} ${a.avg_comment_rate.toFixed(3).padEnd(8)} ${a.composite_score.toFixed(3)}`
    );
  });
  console.log(`\nLast updated: ${store.last_updated}`);
}

function recommend(): void {
  const store = loadStore();
  if (!store.entries.length) {
    console.log("[hook-tracker] No data yet. Defaulting to: bold_claim, curiosity_gap, specific_number");
    return;
  }
  const aggs = computeAggregates(store.entries);
  const top3 = aggs.slice(0, 3);
  console.log("\nTop 3 recommended hook formulas for next batch:");
  top3.forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.formula_name} (composite=${a.composite_score.toFixed(3)}, n=${a.sample_count})`);
  });
}

// ─── CLI Arg Parsing ──────────────────────────────────────────────────────────

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--report")) {
    report();
    return;
  }

  if (args.includes("--recommend")) {
    recommend();
    return;
  }

  if (args.includes("--add-metrics")) {
    const formulaId = getArg(args, "--formula");
    const retention3s = getArg(args, "--retention3s");
    const completion = getArg(args, "--completion");
    const commentRate = getArg(args, "--comment-rate");
    const videoId = getArg(args, "--video-id");

    if (!formulaId || !retention3s || !completion || !commentRate || !videoId) {
      console.error(
        "Usage: --add-metrics --formula <id> --retention3s <0-1> --completion <0-1> --comment-rate <0-1> --video-id <id>"
      );
      process.exit(1);
    }

    addMetrics({
      video_id: videoId,
      formula_id: formulaId,
      retention_3s: parseFloat(retention3s),
      completion_rate: parseFloat(completion),
      comment_rate: parseFloat(commentRate),
      recorded_at: new Date().toISOString(),
    });
    return;
  }

  console.log(`Usage:
  --report          Show performance table for all formulas
  --recommend       Show top 3 formulas to use in next batch
  --add-metrics     Record metrics for a video
    --formula       Hook formula ID (e.g. curiosity_gap)
    --retention3s   0-1 float (% stayed past 3s)
    --completion    0-1 float (% watched to end)
    --comment-rate  0-1 float (comments/views)
    --video-id      Video identifier (e.g. vlog-abc123)`);
}

main();
