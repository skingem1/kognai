/**
 * validate-video-playback.ts — Sprint 598
 * Scans captioned mp4 files and validates they are playable via ffprobe.
 * Reports: duration, resolution, has_audio, file_size, corruption status.
 *
 * Usage: npx ts-node scripts/scs001/validate-video-playback.ts
 * Output: reports/video-playback-audit.json
 */

import { readdirSync, existsSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

const ROOT = resolve(__dirname, '..', '..');
const SCS_DIR = join(ROOT, 'workspace', 'scs001');
const REPORT_PATH = join(ROOT, 'reports', 'video-playback-audit.json');

interface VideoCheck {
  video_id: string;
  path: string;
  file_size_mb: number;
  duration_sec: number;
  resolution: string;
  has_video: boolean;
  has_audio: boolean;
  playable: boolean;
  error: string | null;
}

function findCaptionedVideos(): Array<{ videoId: string; filePath: string }> {
  const results: Array<{ videoId: string; filePath: string }> = [];
  try {
    const runDirs = readdirSync(SCS_DIR).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const captionDir = join(SCS_DIR, dir, 'caption');
      if (!existsSync(captionDir)) continue;
      const files = readdirSync(captionDir).filter(f => f.endsWith('-captioned.mp4'));
      for (const f of files) {
        const videoId = f.replace('-captioned.mp4', '');
        results.push({ videoId, filePath: join(captionDir, f) });
      }
    }
  } catch { /* ignore */ }
  return results;
}

function probeVideo(filePath: string): VideoCheck {
  const videoId = filePath.split('/').pop()?.replace('-captioned.mp4', '') ?? 'unknown';
  const check: VideoCheck = {
    video_id: videoId,
    path: filePath,
    file_size_mb: 0,
    duration_sec: 0,
    resolution: 'unknown',
    has_video: false,
    has_audio: false,
    playable: false,
    error: null,
  };

  try {
    const stat = statSync(filePath);
    check.file_size_mb = Math.round((stat.size / 1_048_576) * 100) / 100;

    if (stat.size === 0) {
      check.error = 'Empty file (0 bytes)';
      return check;
    }

    // Run ffprobe
    const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });
    const probe = JSON.parse(output);

    // Duration
    const duration = parseFloat(probe.format?.duration ?? '0');
    check.duration_sec = Math.round(duration * 10) / 10;

    // Streams
    const streams = probe.streams ?? [];
    for (const s of streams) {
      if (s.codec_type === 'video') {
        check.has_video = true;
        check.resolution = `${s.width ?? '?'}x${s.height ?? '?'}`;
      }
      if (s.codec_type === 'audio') {
        check.has_audio = true;
      }
    }

    // Playability
    check.playable = check.has_video && check.duration_sec > 0;

    if (!check.has_video) check.error = 'No video stream found';
    else if (check.duration_sec <= 0) check.error = 'Zero duration';
    else if (check.duration_sec < 3) check.error = 'Very short (under 3s)';

  } catch (err: any) {
    check.error = `ffprobe failed: ${(err.message ?? '').slice(0, 100)}`;
  }

  return check;
}

function main(): void {
  const videos = findCaptionedVideos();
  console.log(`\n=== Video Playback Audit ===`);
  console.log(`Found ${videos.length} captioned videos\n`);

  if (videos.length === 0) {
    console.log('No captioned videos to validate.');
    return;
  }

  const results: VideoCheck[] = [];
  let passed = 0;
  let failed = 0;

  for (const v of videos) {
    const check = probeVideo(v.filePath);
    results.push(check);

    const icon = check.playable ? '✅' : '❌';
    const audio = check.has_audio ? '🔊' : '🔇';
    console.log(`${icon} ${check.video_id} — ${check.duration_sec}s ${check.resolution} ${audio} ${check.file_size_mb}MB${check.error ? ` ⚠️ ${check.error}` : ''}`);

    if (check.playable) passed++;
    else failed++;
  }

  const report = {
    timestamp: new Date().toISOString(),
    total: results.length,
    passed,
    failed,
    results,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`\n=== Results: ${passed} PASS, ${failed} FAIL of ${results.length} ===`);
  console.log(`Report: ${REPORT_PATH}`);

  if (failed > 0) {
    console.log('\n⚠️ Failed videos:');
    for (const r of results.filter(r => !r.playable)) {
      console.log(`  ${r.video_id}: ${r.error}`);
    }
  }
}

export { findCaptionedVideos, probeVideo };

main();
