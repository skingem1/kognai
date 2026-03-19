#!/usr/bin/env npx ts-node
// Batch Viral Scorer — backfills viral scores for all existing captioned videos
// Usage: npx ts-node scripts/scs001/batch-viral-score.ts [--dry-run]

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { viralScorer, ViralScoreResult } from './viral-scorer';

const WORKSPACE = resolve('workspace/scs001');
const EXPERIMENTS_PATH = join(WORKSPACE, 'experiments.jsonl');
const DRY_RUN = process.argv.includes('--dry-run');

interface ExperimentLine {
  clip_id: string;
  partial_viral_score?: number;
  [key: string]: unknown;
}

function loadExperiments(): ExperimentLine[] {
  if (!existsSync(EXPERIMENTS_PATH)) return [];
  return readFileSync(EXPERIMENTS_PATH, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as ExperimentLine[];
}

function findCaptionedMp4s(): { videoId: string; mp4Path: string }[] {
  const results: { videoId: string; mp4Path: string }[] = [];
  const entries = readdirSync(WORKSPACE).filter(d => d.startsWith('run-'));
  for (const runDir of entries) {
    const captionDir = join(WORKSPACE, runDir, 'caption');
    if (!existsSync(captionDir)) continue;
    const mp4s = readdirSync(captionDir).filter(f => f.endsWith('-captioned.mp4'));
    for (const mp4 of mp4s) {
      results.push({
        videoId: mp4.replace('-captioned.mp4', ''),
        mp4Path: join(captionDir, mp4),
      });
    }
  }
  return results;
}

async function main() {
  console.log(`🧬 Batch Viral Scorer${DRY_RUN ? ' (DRY RUN)' : ''}`);

  const experiments = loadExperiments();
  const scored = new Set(experiments.filter(e => e.partial_viral_score != null).map(e => e.clip_id));
  const mp4s = findCaptionedMp4s();

  console.log(`📊 ${mp4s.length} captioned videos found, ${scored.size} already scored`);

  const toScore = mp4s.filter(m => !scored.has(m.videoId));
  console.log(`🎯 ${toScore.length} videos to score\n`);

  if (toScore.length === 0) {
    console.log('✅ All videos already scored. Nothing to do.');
    return;
  }

  if (DRY_RUN) {
    for (const m of toScore.slice(0, 5)) {
      console.log(`  Would score: ${m.videoId} → ${m.mp4Path}`);
    }
    if (toScore.length > 5) console.log(`  ... and ${toScore.length - 5} more`);
    return;
  }

  // Score and update experiments
  const experimentMap = new Map<string, ExperimentLine>();
  for (const e of experiments) experimentMap.set(e.clip_id, e);

  let successCount = 0;
  for (let i = 0; i < toScore.length; i++) {
    const { videoId, mp4Path } = toScore[i];
    process.stdout.write(`[${i + 1}/${toScore.length}] ${videoId}... `);

    const result = await viralScorer.score(mp4Path, []);
    const existing = experimentMap.get(videoId);

    if (existing) {
      existing.scene_density_score = result.scene_density_score;
      existing.audio_excitement = result.audio_excitement;
      existing.clip_topic_alignment = result.clip_topic_alignment;
      existing.partial_viral_score = result.partial_viral_score;
    } else {
      experimentMap.set(videoId, {
        clip_id: videoId,
        hook_formula: 'unknown',
        speaker: 'unknown',
        qc_passed: true,
        run_id: 'batch-viral-score',
        timestamp: new Date().toISOString(),
        scene_density_score: result.scene_density_score,
        audio_excitement: result.audio_excitement,
        clip_topic_alignment: result.clip_topic_alignment,
        partial_viral_score: result.partial_viral_score,
      });
    }

    console.log(`viral=${result.partial_viral_score}`);
    successCount++;
  }

  // Rewrite experiments.jsonl with updated scores
  const lines = Array.from(experimentMap.values()).map(e => JSON.stringify(e));
  writeFileSync(EXPERIMENTS_PATH, lines.join('\n') + '\n', 'utf8');

  console.log(`\n✅ ${successCount}/${toScore.length} videos scored. experiments.jsonl updated.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
