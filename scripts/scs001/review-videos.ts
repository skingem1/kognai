// SCS-001 Video Review Script — Sprint 121
// Lists generated videos from the latest pipeline run with metadata.
// Use this to decide which video to post manually.
//
// Usage:
//   npx ts-node scripts/scs001/review-videos.ts
//   npx ts-node scripts/scs001/review-videos.ts --run-id scs001-2026-03-16T15-56-33-697Z

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { resolve, join, basename } from 'path';

const WORKSPACE = resolve('workspace/scs001');
const EXPERIMENTS_PATH = join(WORKSPACE, 'experiments.jsonl');

interface VideoMeta {
  video_id:     string;
  hook_formula: string;
  speaker:      string;
  qc_passed:    boolean;
  run_id:       string;
  mp4_path:     string;
}

function loadExperiments(): Map<string, VideoMeta> {
  const map = new Map<string, VideoMeta>();
  if (!existsSync(EXPERIMENTS_PATH)) return map;
  try {
    const lines = readFileSync(EXPERIMENTS_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const e = JSON.parse(trimmed);
        map.set(e.clip_id, {
          video_id:     e.clip_id,
          hook_formula: e.hook_formula ?? 'unknown',
          speaker:      e.speaker ?? 'unknown',
          qc_passed:    !!e.qc_passed,
          run_id:       e.run_id ?? '',
          mp4_path:     '',
        });
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return map;
}

function getLatestRunDir(): string | null {
  if (!existsSync(WORKSPACE)) return null;
  const dirs = readdirSync(WORKSPACE)
    .filter(d => d.startsWith('run-'))
    .map(d => ({ name: d, mtime: statSync(join(WORKSPACE, d)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return dirs.length > 0 ? join(WORKSPACE, dirs[0].name) : null;
}

function findRunDir(runId: string): string | null {
  // run dirs are named run-<timestamp>, not by run_id. Try matching by listing experiments.
  // As fallback, find run dir whose caption/ subdir contains matching video IDs.
  if (!existsSync(WORKSPACE)) return null;
  const dirs = readdirSync(WORKSPACE).filter(d => d.startsWith('run-'));
  for (const d of dirs) {
    const captionDir = join(WORKSPACE, d, 'caption');
    if (existsSync(captionDir)) {
      const files = readdirSync(captionDir);
      if (files.some(f => f.endsWith('.srt'))) {
        // Check if any experiment entry for this runId has its video in here
        const srtIds = files.filter(f => f.endsWith('.srt')).map(f => basename(f, '.srt'));
        const expForRun = Array.from(loadExperiments().values()).filter(e => e.run_id === runId);
        if (expForRun.some(e => srtIds.includes(e.video_id))) {
          return join(WORKSPACE, d);
        }
      }
    }
  }
  return null;
}

function getVideosFromRunDir(runDir: string, experiments: Map<string, VideoMeta>): VideoMeta[] {
  const captionDir = join(runDir, 'caption');
  if (!existsSync(captionDir)) return [];

  const mp4s = readdirSync(captionDir).filter(f => f.endsWith('-captioned.mp4'));
  const results: VideoMeta[] = [];

  for (const mp4 of mp4s) {
    const videoId = mp4.replace('-captioned.mp4', '');
    const meta = experiments.get(videoId);
    results.push({
      video_id:     videoId,
      hook_formula: meta?.hook_formula ?? 'unknown',
      speaker:      meta?.speaker ?? 'unknown',
      qc_passed:    meta?.qc_passed ?? false,
      run_id:       meta?.run_id ?? '',
      mp4_path:     join(captionDir, mp4),
    });
  }

  // QC-passed first
  return results.sort((a, b) => (b.qc_passed ? 1 : 0) - (a.qc_passed ? 1 : 0));
}

function printVideos(videos: VideoMeta[], runDir: string): void {
  const passed = videos.filter(v => v.qc_passed).length;
  const runName = basename(runDir);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  SCS-001 Video Review — ${runName}`);
  console.log(`  ${videos.length} videos | ${passed} QC-passed | ready to post`);
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  #   ID               QC   Formula           Speaker');
  console.log('  ─────────────────────────────────────────────────────────────');

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const num = String(i + 1).padStart(2);
    const id = v.video_id.slice(0, 16).padEnd(16);
    const qc = v.qc_passed ? '✓  ' : '✗  ';
    const formula = (v.hook_formula).padEnd(17);
    const speaker = v.speaker.slice(0, 20);
    console.log(`  ${num}  ${id} ${qc}  ${formula} ${speaker}`);
  }

  console.log('\n  File paths (captioned MP4s):');
  for (let i = 0; i < videos.length; i++) {
    console.log(`  ${i + 1}. ${videos[i].mp4_path}`);
  }

  console.log('\n  To record a manual post after posting:');
  console.log('  npx ts-node scripts/scs001/record-manual-post.ts --video-id <ID> --views <N> [--title <str>]');
  console.log('══════════════════════════════════════════════════════════════\n');
}

// ── Main ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const runIdIdx = args.indexOf('--run-id');
const experiments = loadExperiments();

let runDir: string | null = null;
if (runIdIdx !== -1 && args[runIdIdx + 1]) {
  runDir = findRunDir(args[runIdIdx + 1]);
  if (!runDir) {
    console.error(`[review-videos] Run dir for run-id "${args[runIdIdx + 1]}" not found. Using latest.`);
    runDir = getLatestRunDir();
  }
} else {
  runDir = getLatestRunDir();
}

if (!runDir) {
  console.log('\n[review-videos] No pipeline run directories found in workspace/scs001/\n');
  process.exit(0);
}

const videos = getVideosFromRunDir(runDir, experiments);
if (videos.length === 0) {
  console.log(`\n[review-videos] No captioned videos found in ${runDir}\n`);
  process.exit(0);
}

printVideos(videos, runDir);
