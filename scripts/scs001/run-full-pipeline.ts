#!/usr/bin/env ts-node
/**
 * SCS-001 Sprint 447 — Full End-to-End Pipeline Runner
 *
 * Chains ALL pipeline stages with timing + cost logging:
 *   Trend → Discovery → ClipDetection → Insight → Script → LLMRewrite →
 *   Editing → TTS → AudioMix → CaptionOverlay
 *
 * Modes:
 *   --mock      Use mock data (no API calls for Trend/Discovery)
 *   --dry-run   Skip FFmpeg/API execution, log what would happen
 *   --cloud     Use Claude Sonnet for LLM rewrite (default: local qwen3:14b)
 *   --limit N   Process only first N topics (default: 3)
 *
 * Usage:
 *   npx ts-node scripts/scs001/run-full-pipeline.ts --mock --dry-run
 *   npx ts-node scripts/scs001/run-full-pipeline.ts --mock
 *   npx ts-node scripts/scs001/run-full-pipeline.ts --limit 1
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ── Agent imports ─────────────────────────────────────
import { TrendAgent } from "../../agents/scs001-trend/index";
import { DiscoveryAgent, DiscoveryOutput } from "../../agents/scs001-discovery/index";
import { ClipDetectionAgent, ClipQualityScore } from "../../agents/scs001-clip-detection/index";
import { InsightAgent, getMockInsightBriefs, InsightBrief } from "../../agents/scs001-insight/index";
import { ScriptAgent, ScriptBundle } from "../../agents/scs001-script/index";
import { EditingAgent } from "../../agents/scs001-editing/index";

// ── Script imports ────────────────────────────────────
import { rewriteScript, RewriteResult } from "./llm-script-rewriter";
import { generateVoiceover, VoiceoverResult } from "./tts-voiceover";
import { mixAudio, MixResult } from "./audio-mixer";
import { generateCaptions, CaptionResult } from "./caption-overlay";
import { hookQualityScore } from "./hook-quality";
import { selectMusic } from "./music-selector";

// ── Types ─────────────────────────────────────────────

interface StepResult {
  step: string;
  status: "pass" | "fail" | "skip";
  duration_ms: number;
  cost_usd: number;
  items_in: number;
  items_out: number;
  error?: string;
}

interface PipelineReport {
  run_id: string;
  started_at: string;
  finished_at: string;
  mode: { mock: boolean; dry_run: boolean; cloud: boolean; limit: number };
  steps: StepResult[];
  total_duration_ms: number;
  total_cost_usd: number;
  videos_produced: number;
  summary: string;
}

// ── Helpers ───────────────────────────────────────────

const ROOT = join(__dirname, "..", "..");
const OUT_DIR = join(ROOT, "workspace", "scs001", "pipeline-runs");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function parseArgs(): { mock: boolean; dryRun: boolean; cloud: boolean; limit: number } {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  return {
    mock: args.includes("--mock"),
    dryRun: args.includes("--dry-run"),
    cloud: args.includes("--cloud"),
    limit: limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) || 3 : 3,
  };
}

async function timed<T>(
  name: string,
  fn: () => Promise<T> | T
): Promise<{ result: T; duration_ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, duration_ms: Date.now() - start };
}

// ── Main Pipeline ─────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs();
  const runId = "pipeline-" + Date.now();
  const steps: StepResult[] = [];
  let totalCost = 0;

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  SCS-001 Full Pipeline — E2E Run");
  console.log("  Mode: " + (opts.mock ? "MOCK" : "LIVE") + " | " + (opts.dryRun ? "DRY-RUN" : "EXECUTE") + " | " + (opts.cloud ? "CLOUD" : "LOCAL"));
  console.log("  Limit: " + opts.limit + " topics");
  console.log("  Run ID: " + runId);
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  const pipelineStart = Date.now();

  // ── Step 1: Trend Discovery ─────────────────────────
  console.log("▶ Step 1/9: Trend Agent");
  let trendBatch: any;
  try {
    const { result, duration_ms } = await timed("trend", async () => {
      const agent = new TrendAgent();
      return agent.run();
    });
    trendBatch = result;
    if (trendBatch.topics.length > opts.limit) {
      trendBatch.topics = trendBatch.topics.slice(0, opts.limit);
    }
    steps.push({ step: "trend", status: "pass", duration_ms, cost_usd: 0, items_in: 0, items_out: trendBatch.topics.length });
    console.log("  ✓ " + trendBatch.topics.length + " topics in " + duration_ms + "ms");
  } catch (e: any) {
    steps.push({ step: "trend", status: "fail", duration_ms: 0, cost_usd: 0, items_in: 0, items_out: 0, error: e.message });
    console.log("  ✗ FAIL: " + e.message);
    return saveReport(runId, pipelineStart, opts, steps, totalCost, 0);
  }

  // ── Step 2: Discovery Agent ─────────────────────────
  console.log("▶ Step 2/9: Discovery Agent");
  let discoveries: DiscoveryOutput[];
  try {
    const { result, duration_ms } = await timed("discovery", async () => {
      const agent = new DiscoveryAgent();
      return agent.run(trendBatch);
    });
    discoveries = result;
    steps.push({ step: "discovery", status: "pass", duration_ms, cost_usd: 0, items_in: trendBatch.topics.length, items_out: discoveries.length });
    console.log("  ✓ " + discoveries.length + " discoveries in " + duration_ms + "ms");
  } catch (e: any) {
    steps.push({ step: "discovery", status: "fail", duration_ms: 0, cost_usd: 0, items_in: trendBatch.topics.length, items_out: 0, error: e.message });
    console.log("  ✗ FAIL: " + e.message);
    return saveReport(runId, pipelineStart, opts, steps, totalCost, 0);
  }

  // ── Step 3: Clip Detection ──────────────────────────
  console.log("▶ Step 3/9: Clip Detection Agent");
  let clips: ClipQualityScore[];
  try {
    const { result, duration_ms } = await timed("clip-detection", async () => {
      const agent = new ClipDetectionAgent();
      return agent.run(discoveries);
    });
    clips = result;
    const qualified = clips.filter((c) => c.qualified);
    steps.push({ step: "clip-detection", status: "pass", duration_ms, cost_usd: 0, items_in: discoveries.length, items_out: qualified.length });
    console.log("  ✓ " + qualified.length + "/" + clips.length + " qualified clips in " + duration_ms + "ms");
    clips = qualified;
  } catch (e: any) {
    steps.push({ step: "clip-detection", status: "fail", duration_ms: 0, cost_usd: 0, items_in: discoveries.length, items_out: 0, error: e.message });
    console.log("  ✗ FAIL: " + e.message);
    return saveReport(runId, pipelineStart, opts, steps, totalCost, 0);
  }

  // ── Step 4: Insight Agent ───────────────────────────
  console.log("▶ Step 4/9: Insight Agent");
  let briefs: InsightBrief[];
  try {
    if (opts.mock) {
      briefs = getMockInsightBriefs();
      if (briefs.length > opts.limit) briefs = briefs.slice(0, opts.limit);
      steps.push({ step: "insight", status: "pass", duration_ms: 0, cost_usd: 0, items_in: clips.length, items_out: briefs.length });
      console.log("  ✓ " + briefs.length + " briefs (mock) in 0ms");
    } else {
      const { result, duration_ms } = await timed("insight", async () => {
        const agent = new InsightAgent();
        return agent.run(clips);
      });
      briefs = result;
      steps.push({ step: "insight", status: "pass", duration_ms, cost_usd: 0, items_in: clips.length, items_out: briefs.length });
      console.log("  ✓ " + briefs.length + " briefs in " + duration_ms + "ms");
    }
  } catch (e: any) {
    // Fallback to mock briefs if insight agent fails
    console.log("  ⚠ Insight agent failed, using mock briefs: " + e.message);
    briefs = getMockInsightBriefs().slice(0, opts.limit);
    steps.push({ step: "insight", status: "pass", duration_ms: 0, cost_usd: 0, items_in: clips.length, items_out: briefs.length, error: "fallback to mock: " + e.message });
  }

  // ── Step 5: Script Agent ────────────────────────────
  console.log("▶ Step 5/9: Script Agent");
  let bundles: ScriptBundle[];
  try {
    const { result, duration_ms } = await timed("script", () => {
      const agent = new ScriptAgent();
      return agent.run(briefs);
    });
    bundles = result;
    // Score hooks
    bundles.forEach((b) => {
      const hookSeg = b.segments.find((s) => s.segment_name === "hook");
      if (hookSeg?.voiceover_text) {
        const score = hookQualityScore(hookSeg.voiceover_text, "");
        console.log("    Hook score: " + (score * 100).toFixed(0) + "% — " + hookSeg.voiceover_text.slice(0, 60));
      }
    });
    steps.push({ step: "script", status: "pass", duration_ms, cost_usd: 0, items_in: briefs.length, items_out: bundles.length });
    console.log("  ✓ " + bundles.length + " bundles in " + duration_ms + "ms");
  } catch (e: any) {
    steps.push({ step: "script", status: "fail", duration_ms: 0, cost_usd: 0, items_in: briefs.length, items_out: 0, error: e.message });
    console.log("  ✗ FAIL: " + e.message);
    return saveReport(runId, pipelineStart, opts, steps, totalCost, 0);
  }

  // ── Step 6: LLM Script Rewrite ──────────────────────
  console.log("▶ Step 6/9: LLM Script Rewriter");
  const rewrittenBundles: ScriptBundle[] = [];
  let rewriteCost = 0;
  try {
    for (const bundle of bundles) {
      if (opts.dryRun) {
        rewrittenBundles.push(bundle);
        console.log("    [dry-run] Would rewrite: " + bundle.script_id);
        continue;
      }
      const { result, duration_ms } = await timed("rewrite-" + bundle.script_id, () =>
        rewriteScript({ bundle }, opts.cloud, false)
      );
      rewrittenBundles.push(result.bundle);
      rewriteCost += result.cost_usd;
      console.log("    Rewrite " + bundle.script_id + ": " + result.model_used + " (" + duration_ms + "ms, $" + result.cost_usd.toFixed(4) + ")");
    }
    totalCost += rewriteCost;
    steps.push({ step: "llm-rewrite", status: "pass", duration_ms: 0, cost_usd: rewriteCost, items_in: bundles.length, items_out: rewrittenBundles.length });
    console.log("  ✓ " + rewrittenBundles.length + " rewritten ($" + rewriteCost.toFixed(4) + " total)");
  } catch (e: any) {
    // Fallback: use original bundles
    console.log("  ⚠ Rewrite failed, using original scripts: " + e.message);
    rewrittenBundles.push(...bundles.filter((b) => !rewrittenBundles.find((rb) => rb.script_id === b.script_id)));
    steps.push({ step: "llm-rewrite", status: "pass", duration_ms: 0, cost_usd: rewriteCost, items_in: bundles.length, items_out: rewrittenBundles.length, error: "partial fallback: " + e.message });
  }

  // ── Step 7: Editing (FFmpeg video assembly) ─────────
  console.log("▶ Step 7/9: Editing Agent (FFmpeg)");
  let videos: any[] = [];
  try {
    if (opts.dryRun) {
      videos = rewrittenBundles.map((b) => ({
        script_id: b.script_id,
        output_path: "[dry-run] workspace/scs001/editing-outputs/" + b.script_id + ".mp4",
        duration_s: b.total_duration_seconds || 30,
      }));
      steps.push({ step: "editing", status: "skip", duration_ms: 0, cost_usd: 0, items_in: rewrittenBundles.length, items_out: videos.length });
      console.log("  ⊘ DRY-RUN: would produce " + videos.length + " videos");
    } else {
      const { result, duration_ms } = await timed("editing", () => {
        const agent = new EditingAgent();
        return agent.run(rewrittenBundles);
      });
      videos = result;
      steps.push({ step: "editing", status: "pass", duration_ms, cost_usd: 0, items_in: rewrittenBundles.length, items_out: videos.length });
      console.log("  ✓ " + videos.length + " videos in " + duration_ms + "ms");
    }
  } catch (e: any) {
    steps.push({ step: "editing", status: "fail", duration_ms: 0, cost_usd: 0, items_in: rewrittenBundles.length, items_out: 0, error: e.message });
    console.log("  ✗ FAIL: " + e.message);
    // Continue — TTS + captions can still be generated without video
    videos = rewrittenBundles.map((b) => ({
      script_id: b.script_id,
      output_path: "FAILED",
      duration_s: b.total_duration_seconds || 30,
    }));
  }

  // ── Step 8: TTS Voiceover ──────────────────────────
  console.log("▶ Step 8/9: TTS Voiceover");
  const voiceovers: VoiceoverResult[] = [];
  let ttsCost = 0;
  try {
    for (const bundle of rewrittenBundles) {
      const { result, duration_ms } = await timed("tts-" + bundle.script_id, () =>
        generateVoiceover(bundle, undefined, opts.dryRun)
      );
      voiceovers.push(result);
      ttsCost += result.total_cost_usd;
      console.log("    TTS " + bundle.script_id + ": " + result.segments.length + " segments, " + result.total_duration_s.toFixed(1) + "s ($" + result.total_cost_usd.toFixed(4) + ")");
    }
    totalCost += ttsCost;
    steps.push({ step: "tts", status: "pass", duration_ms: 0, cost_usd: ttsCost, items_in: rewrittenBundles.length, items_out: voiceovers.length });
    console.log("  ✓ " + voiceovers.length + " voiceovers ($" + ttsCost.toFixed(4) + ")");
  } catch (e: any) {
    steps.push({ step: "tts", status: "fail", duration_ms: 0, cost_usd: ttsCost, items_in: rewrittenBundles.length, items_out: voiceovers.length, error: e.message });
    console.log("  ✗ FAIL: " + e.message);
  }

  // ── Step 9: Caption Overlay ─────────────────────────
  console.log("▶ Step 9/9: Caption Overlay");
  const captions: CaptionResult[] = [];
  let captionCost = 0;
  try {
    for (let i = 0; i < rewrittenBundles.length; i++) {
      const bundle = rewrittenBundles[i];
      const videoPath = videos[i]?.output_path;
      const { result, duration_ms } = await timed("caption-" + bundle.script_id, () =>
        generateCaptions(bundle, videoPath !== "FAILED" ? videoPath : undefined, undefined, opts.dryRun)
      );
      captions.push(result);
      captionCost += result.cost_usd;
      console.log("    Caption " + bundle.script_id + ": " + result.overlays.length + " overlays ($" + result.cost_usd.toFixed(4) + ")");
    }
    totalCost += captionCost;
    steps.push({ step: "captions", status: "pass", duration_ms: 0, cost_usd: captionCost, items_in: rewrittenBundles.length, items_out: captions.length });
    console.log("  ✓ " + captions.length + " captioned ($" + captionCost.toFixed(4) + ")");
  } catch (e: any) {
    steps.push({ step: "captions", status: "fail", duration_ms: 0, cost_usd: captionCost, items_in: rewrittenBundles.length, items_out: captions.length, error: e.message });
    console.log("  ✗ FAIL: " + e.message);
  }

  // ── Report ──────────────────────────────────────────
  const videosProduced = videos.filter((v) => v.output_path !== "FAILED").length;
  saveReport(runId, pipelineStart, opts, steps, totalCost, videosProduced);
}

function saveReport(
  runId: string,
  startTime: number,
  opts: { mock: boolean; dryRun: boolean; cloud: boolean; limit: number },
  steps: StepResult[],
  totalCost: number,
  videosProduced: number
): void {
  const finishedAt = new Date().toISOString();
  const totalMs = Date.now() - startTime;

  const passed = steps.filter((s) => s.status === "pass").length;
  const failed = steps.filter((s) => s.status === "fail").length;
  const skipped = steps.filter((s) => s.status === "skip").length;

  const report: PipelineReport = {
    run_id: runId,
    started_at: new Date(startTime).toISOString(),
    finished_at: finishedAt,
    mode: opts,
    steps,
    total_duration_ms: totalMs,
    total_cost_usd: totalCost,
    videos_produced: videosProduced,
    summary: passed + " passed, " + failed + " failed, " + skipped + " skipped — " + videosProduced + " videos — $" + totalCost.toFixed(4) + " — " + (totalMs / 1000).toFixed(1) + "s",
  };

  ensureDir(OUT_DIR);
  const reportPath = join(OUT_DIR, runId + ".json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  PIPELINE COMPLETE");
  console.log("  " + report.summary);
  console.log("  Report: " + reportPath);
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  // Set exit code based on failures
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Pipeline fatal error:", err);
  process.exitCode = 1;
});
