/**
 * Pipeline 1: Educational AI Avatar Style
 *
 * Wraps produce-vlog.ts (avatar + B-roll + Whisper subtitles + Kognai outro).
 * Registered via pipeline-registry.ts.
 *
 * Sprint 899
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import type { PipelineRunner, PipelineInput, PipelineRunResult, PipelineConfig } from '../pipeline-registry';

export const educationalConfig: PipelineConfig = {
  name: 'educational',
  displayName: 'Pipeline 1: Educational AI Avatar Style',
  description: 'AI avatar presenter + B-roll cutaways + Whisper-synced subtitles + Kognai outro',
  costRange: { min: 0.15, max: 0.50 },
  durationRange: { min: 25, max: 45 },
  inputType: 'topic',
};

export const educationalRunner: PipelineRunner = {
  config: educationalConfig,

  async run(input: PipelineInput): Promise<PipelineRunResult> {
    const topic = input.topic || 'AI agents are transforming software development';

    const mode = input.options?.mode || 'avatar';
    const { produceVlog } = await import('../produce-vlog');
    const videoPath = await produceVlog(topic, mode);

    // Read meta.json from the run directory
    const runDir = dirname(videoPath);
    const metaPath = join(runDir, 'meta.json');
    let meta: Record<string, unknown> = {};
    if (existsSync(metaPath)) {
      try { meta = JSON.parse(readFileSync(metaPath, 'utf-8')); } catch {}
    }

    return {
      pipeline: 'educational',
      runId: (meta.runId as string) || `edu-${Date.now().toString(36)}`,
      videoPath,
      title: (meta.title as string) || topic,
      duration_s: (meta.elapsed_s as number) || 30,
      cost_usd: 0.26, // avg: $0.05 avatar + $0.21 B-roll
      quality_score: 75, // placeholder until self-scorer is built
      metadata: meta,
      produced_at: new Date().toISOString(),
    };
  },
};
