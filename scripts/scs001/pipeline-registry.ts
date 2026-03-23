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
