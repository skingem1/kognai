/**
 * pipeline-registry.ts — Central SCS-001 pipeline routing + metrics
 *
 * All 3 pipelines register here. Provides unified interface for:
 * - Telegram commands (/p1, /p2, /p3)
 * - Batch production (batch-produce.ts)
 * - Metrics logging (pipeline-runs.jsonl)
 *
 * Sprint 899 — Pipeline restructuring
 */

import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const METRICS_DIR = join(ROOT, 'logs', 'pipeline-metrics');
const LEDGER_PATH = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');

// ── Types ────────────────────────────────────────────

export type PipelineName = 'educational' | 'code-demo' | 'entertainment';

export interface PipelineConfig {
  name: PipelineName;
  displayName: string;
  description: string;
  costRange: { min: number; max: number };
  durationRange: { min: number; max: number };
  inputType: 'topic' | 'code' | 'topic-choice';
}

export interface PipelineInput {
  pipeline: PipelineName;
  topic?: string;
  code?: string;
  options?: {
    withVoiceover?: boolean;
    withMusic?: boolean;
    dryRun?: boolean;
    mode?: 'avatar' | 'tts';
  };
}

export interface PipelineRunResult {
  pipeline: PipelineName;
  runId: string;
  videoPath: string;
  title: string;
  duration_s: number;
  cost_usd: number;
  quality_score: number;
  metadata: Record<string, unknown>;
  produced_at: string;
  /** Sprint 1342: Set true by logToPublishLedger() on successful primary write */
  ledgerWritten?: boolean;
}

export interface PipelineRunner {
  config: PipelineConfig;
  run(input: PipelineInput): Promise<PipelineRunResult>;
}

// ── Registry ─────────────────────────────────────────

const pipelines = new Map<PipelineName, PipelineRunner>();

export function registerPipeline(runner: PipelineRunner): void {
  pipelines.set(runner.config.name, runner);
}

export function getPipeline(name: PipelineName): PipelineRunner | undefined {
  return pipelines.get(name);
}

export function listPipelines(): PipelineConfig[] {
  return Array.from(pipelines.values()).map(p => p.config);
}

export async function runPipeline(input: PipelineInput): Promise<PipelineRunResult> {
  const runner = pipelines.get(input.pipeline);
  if (!runner) throw new Error(`Pipeline "${input.pipeline}" not registered`);

  const startTime = Date.now();
  console.log(`\n[pipeline-registry] Starting "${runner.config.displayName}"...`);

  const result = await runner.run(input);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`[pipeline-registry] Completed in ${elapsed}s — ${result.videoPath}`);

  // Log metrics
  logMetrics(result, parseInt(elapsed));

  // Sprint 1316: Write to publish-ledger so auto-deliver picks up code-demo + entertainment videos
  // Sprint 1342: logToPublishLedger sets result.ledgerWritten = true on success
  logToPublishLedger(result);

  return result;
}

// ── Metrics ──────────────────────────────────────────

function logMetrics(result: PipelineRunResult, elapsed_s: number): void {
  mkdirSync(METRICS_DIR, { recursive: true });
  const entry = {
    ...result,
    elapsed_s,
    logged_at: new Date().toISOString(),
  };
  try {
    appendFileSync(
      join(METRICS_DIR, 'pipeline-runs.jsonl'),
      JSON.stringify(entry) + '\n'
    );
  } catch {}
}

// ── Publish Ledger ───────────────────────────────────

function logToPublishLedger(result: PipelineRunResult): void {
  try {
    // Coerce to string to prevent JSON.stringify from omitting undefined values
    const entry = {
      video_id: String(result.runId || ''),
      video_path: String(result.videoPath || ''),
      file_path: String(result.videoPath || ''),
      file_exists: true,
      published_at: result.produced_at,
      title: String(result.title || ''),
      topic: String(result.title || ''),
      duration_s: result.duration_s || 0,
      cost_usd: result.cost_usd || 0,
      source: 'batch-pipeline',
      pipeline: result.pipeline,
      viral_score: result.quality_score || 0,
    };
    mkdirSync(join(ROOT, 'workspace', 'scs001'), { recursive: true });
    appendFileSync(LEDGER_PATH, JSON.stringify(entry) + '\n');
    // Sprint 1342: Signal to batch-produce that fallback write is unnecessary
    result.ledgerWritten = true;
    console.log(`[pipeline-registry] Ledger entry added: ${result.runId}`);
  } catch (e: any) {
    // Sprint 1326: expose ledger write failures so they don't silently break auto-deliver
    console.error(`[pipeline-registry] Ledger write FAILED for ${result.runId}: ${e.message ?? e}`);
  }
}

// ── Auto-register pipelines on import ────────────────

export async function initRegistry(): Promise<void> {
  try {
    const { educationalRunner } = await import('./pipelines/educational');
    registerPipeline(educationalRunner);
  } catch (err: any) {
    console.warn(`[registry] Failed to load educational pipeline: ${err.message?.slice(0, 60)}`);
  }

  try {
    const { codeDemoRunner } = await import('./pipelines/code-demo');
    registerPipeline(codeDemoRunner);
  } catch (err: any) {
    console.warn(`[registry] Failed to load code-demo pipeline: ${err.message?.slice(0, 60)}`);
  }

  try {
    const { entertainmentRunner } = await import('./pipelines/entertainment');
    registerPipeline(entertainmentRunner);
  } catch (err: any) {
    console.warn(`[registry] Failed to load entertainment pipeline: ${err.message?.slice(0, 60)}`);
  }

  console.log(`[registry] ${pipelines.size} pipeline(s) registered: ${Array.from(pipelines.keys()).join(', ')}`);
}
