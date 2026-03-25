/**
 * Pipeline 3: Entertainment Video Style
 *
 * AI-generated video from trending topics with optional voiceover and music.
 * Uses fal.ai Kling/Wan for scene generation, topic-radar for trending topics.
 *
 * Sprint 1223 — Implementation wired up (assembler + scriptgen)
 */

import { join } from 'path';
import { mkdirSync } from 'fs';
import type { PipelineRunner, PipelineInput, PipelineRunResult, PipelineConfig } from '../pipeline-registry';

export const entertainmentConfig: PipelineConfig = {
  name: 'entertainment',
  displayName: 'Pipeline 3: Entertainment Video Style',
  description: 'AI-generated video from trending topics with optional voiceover and music',
  costRange: { min: 0.20, max: 1.50 },
  durationRange: { min: 15, max: 60 },
  inputType: 'topic-choice',
};

export const entertainmentRunner: PipelineRunner = {
  config: entertainmentConfig,

  async run(input: PipelineInput): Promise<PipelineRunResult> {
    const ROOT = join(__dirname, '..', '..', '..');
    const topic = input.topic ?? 'AI is changing everything you know about the future';
    const withVoiceover = input.options?.withVoiceover ?? true;
    const withMusic = input.options?.withMusic ?? true;

    const { generateEntertainmentScript } = await import('../entertainment-scriptgen');
    const { assembleEntertainmentVideo } = await import('../entertainment-assembler');

    const runId = `ent-${Date.now().toString(36)}`;
    const outDir = join(ROOT, 'workspace', 'scs001', 'entertainment-runs', runId);
    mkdirSync(outDir, { recursive: true });

    const script = await generateEntertainmentScript(topic, { withVoiceover, withMusic });
    const outputPath = join(outDir, `${runId}.mp4`);
    const finalPath = await assembleEntertainmentVideo(script, outputPath);

    return {
      pipeline: 'entertainment',
      runId,
      videoPath: finalPath,
      title: script.title,
      duration_s: script.total_duration_s,
      cost_usd: 0.30, // ~2 Kling + 4 Wan clips estimate
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
