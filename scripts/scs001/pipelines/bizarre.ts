/**
 * Pipeline 4: Kognai Bizarre Series
 *
 * AI-generated video from bizarre real facts, unusual historical events,
 * and mind-bending science. Reuses fal.ai scene generation from P3
 * with Bizarre Series branding on the outro.
 *
 * Sprint 1415 — Kognai Bizarre Series (Pipeline 4)
 */

import { join } from 'path';
import { mkdirSync } from 'fs';
import type { PipelineRunner, PipelineInput, PipelineRunResult, PipelineConfig } from '../pipeline-registry';

export const bizarreConfig: PipelineConfig = {
  name: 'bizarre',
  displayName: 'Pipeline 4: Kognai Bizarre Series',
  description: 'Mind-bending real facts and bizarre events — stranger than fiction',
  costRange: { min: 0.20, max: 1.50 },
  durationRange: { min: 15, max: 60 },
  inputType: 'topic-choice',
};

export const bizarreRunner: PipelineRunner = {
  config: bizarreConfig,

  async run(input: PipelineInput): Promise<PipelineRunResult> {
    const ROOT = join(__dirname, '..', '..', '..');
    const topic = input.topic ?? 'bizarre fact that sounds impossible but is completely real';
    const withVoiceover = input.options?.withVoiceover ?? true;
    const withMusic = input.options?.withMusic ?? true;

    const { generateBizarreScript } = await import('../bizarre-scriptgen');
    const { assembleEntertainmentVideo } = await import('../entertainment-assembler');

    const runId = `biz-${Date.now().toString(36)}`;
    const outDir = join(ROOT, 'workspace', 'scs001', 'bizarre-runs', runId);
    mkdirSync(outDir, { recursive: true });

    const script = await generateBizarreScript(topic, { withVoiceover, withMusic });
    const outputPath = join(outDir, `${runId}.mp4`);
    // Sprint 1415: pass seriesLabel so assembler generates 'Bizarre Series' outro branding
    const finalPath = await assembleEntertainmentVideo(script, outputPath, { seriesLabel: 'Bizarre Series' });

    return {
      pipeline: 'bizarre',
      runId,
      videoPath: finalPath,
      title: script.title,
      duration_s: script.total_duration_s,
      cost_usd: 0.30, // ~2 Kling + 4 Wan clips estimate (same as P3)
      quality_score: 7,
      metadata: {
        topic,
        scenes: script.scenes.length,
        with_voiceover: withVoiceover,
        with_music: withMusic,
        hashtags: script.hashtags,
      },
      produced_at: new Date().toISOString(),
    };
  },
};
