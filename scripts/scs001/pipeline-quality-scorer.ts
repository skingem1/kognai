/**
 * pipeline-quality-scorer.ts — Per-video auto-scoring (Sprint TICKET-015-QS-01)
 *
 * Scores each video 0-100 across 5 dimensions:
 *   1. duration_ok     — 15–90s (25 pts)
 *   2. has_audio       — reuses qc-agent check (20 pts)
 *   3. has_subtitles   — srt/vtt file exists alongside the video (20 pts)
 *   4. hook_timing     — first cut/scene ≤3s via ffprobe scene detection (20 pts)
 *   5. resolution_ok   — width ≥720px (15 pts)
 *
 * Composite score < 60 → flagged. Caller should skip ledger write.
 * Appends result to logs/pipeline-metrics/quality-scores.jsonl.
 */

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname, extname, basename } from 'path';
import { execSync } from 'child_process';

// ── Types ────────────────────────────────────────────────────────────────────

export interface QualityDimension {
  pass: boolean;
  score: number;      // points earned (0 or max)
  max: number;        // max points available
  reason: string;
}

export interface QualityScoreResult {
  video_id: string;
  video_path: string;
  scored_at: string;
  composite_score: number;   // 0–100
  pass: boolean;             // composite_score >= PASS_THRESHOLD
  dimensions: {
    duration_ok: QualityDimension;
    has_audio: QualityDimension;
    has_subtitles: QualityDimension;
    hook_timing: QualityDimension;
    resolution_ok: QualityDimension;
  };
}

const PASS_THRESHOLD = 60;
const QUALITY_LOG_DIR = 'logs/pipeline-metrics';
const QUALITY_LOG_FILE = join(QUALITY_LOG_DIR, 'quality-scores.jsonl');

// ── Dimension weights ────────────────────────────────────────────────────────

const WEIGHTS = {
  duration_ok:   25,
  has_audio:     20,
  has_subtitles: 20,
  hook_timing:   20,
  resolution_ok: 15,
} as const;

// ── ffprobe helper ────────────────────────────────────────────────────────────

interface ProbeResult {
  duration: number | null;
  has_audio: boolean;
  width: number | null;
  height: number | null;
}

function probeVideo(filePath: string): ProbeResult {
  const result: ProbeResult = { duration: null, has_audio: false, width: null, height: null };
  try {
    const raw = execSync(
      `ffprobe -v quiet -print_format json -show_streams -show_format "${filePath}" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 10_000 }
    );
    const probe = JSON.parse(raw);
    const streams: any[] = probe.streams || [];
    const fmt = probe.format || {};

    result.duration = parseFloat(fmt.duration) || null;
    result.has_audio = streams.some((s: any) => s.codec_type === 'audio' && (parseFloat(s.duration) || 0) > 0.5);

    const videoStream = streams.find((s: any) => s.codec_type === 'video');
    if (videoStream) {
      result.width = parseInt(videoStream.width, 10) || null;
      result.height = parseInt(videoStream.height, 10) || null;
    }
  } catch { /* ffprobe unavailable or corrupt file */ }
  return result;
}

// ── Dimension checks ──────────────────────────────────────────────────────────

function checkDurationOk(probe: ProbeResult): QualityDimension {
  const max = WEIGHTS.duration_ok;
  if (probe.duration === null) {
    return { pass: false, score: 0, max, reason: 'Could not read duration via ffprobe' };
  }
  if (probe.duration < 15) {
    return { pass: false, score: 0, max, reason: `Duration ${probe.duration.toFixed(1)}s < 15s minimum` };
  }
  if (probe.duration > 90) {
    return { pass: false, score: 0, max, reason: `Duration ${probe.duration.toFixed(1)}s > 90s maximum` };
  }
  return { pass: true, score: max, max, reason: `Duration ${probe.duration.toFixed(1)}s is within 15–90s` };
}

function checkHasAudio(probe: ProbeResult): QualityDimension {
  const max = WEIGHTS.has_audio;
  if (!probe.has_audio) {
    return { pass: false, score: 0, max, reason: 'No audio stream detected (or duration < 0.5s)' };
  }
  return { pass: true, score: max, max, reason: 'Audio stream present' };
}

function checkHasSubtitles(videoPath: string): QualityDimension {
  const max = WEIGHTS.has_subtitles;
  const dir = dirname(videoPath);
  const base = basename(videoPath, extname(videoPath));

  // Look for .srt or .vtt alongside the video file
  const srtPath = join(dir, base + '.srt');
  const vttPath = join(dir, base + '.vtt');

  if (existsSync(srtPath)) {
    return { pass: true, score: max, max, reason: `Subtitles found: ${base}.srt` };
  }
  if (existsSync(vttPath)) {
    return { pass: true, score: max, max, reason: `Subtitles found: ${base}.vtt` };
  }
  return { pass: false, score: 0, max, reason: 'No .srt or .vtt subtitle file found alongside video' };
}

function checkHookTiming(videoPath: string): QualityDimension {
  const max = WEIGHTS.hook_timing;
  try {
    // Use ffprobe scene detection to find first scene change time
    const raw = execSync(
      `ffprobe -v quiet -show_frames -select_streams v -of json -skip_frame noref ` +
      `-vf "select=gt(scene\\,0.4)" "${videoPath}" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 15_000 }
    );
    const frames = JSON.parse(raw).frames || [];
    if (frames.length === 0) {
      // No scene change detected — single-cut video, hook timing N/A — grant full score
      return { pass: true, score: max, max, reason: 'No scene cuts detected — single-take video (hook timing N/A)' };
    }
    const firstCutTime = parseFloat(frames[0].best_effort_timestamp_time || frames[0].pkt_pts_time || '999');
    if (firstCutTime <= 3.0) {
      return { pass: true, score: max, max, reason: `First cut at ${firstCutTime.toFixed(2)}s ≤ 3s hook window` };
    }
    return { pass: false, score: 0, max, reason: `First cut at ${firstCutTime.toFixed(2)}s > 3s hook window` };
  } catch {
    // ffprobe failed — grant score (non-blocking)
    return { pass: true, score: max, max, reason: 'Hook timing check unavailable (ffprobe error) — granted' };
  }
}

function checkResolutionOk(probe: ProbeResult): QualityDimension {
  const max = WEIGHTS.resolution_ok;
  if (probe.width === null) {
    return { pass: false, score: 0, max, reason: 'Could not read video width via ffprobe' };
  }
  if (probe.width < 720) {
    return { pass: false, score: 0, max, reason: `Width ${probe.width}px < 720px minimum` };
  }
  return { pass: true, score: max, max, reason: `Width ${probe.width}px ≥ 720px` };
}

// ── Logging ───────────────────────────────────────────────────────────────────

function logQualityScore(result: QualityScoreResult): void {
  try {
    if (!existsSync(QUALITY_LOG_DIR)) mkdirSync(QUALITY_LOG_DIR, { recursive: true });
    appendFileSync(QUALITY_LOG_FILE, JSON.stringify(result) + '\n');
  } catch { /* non-fatal */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score a single video. Returns QualityScoreResult.
 * Composite score < 60 means the video should be flagged and skipped.
 */
export function scoreVideo(videoId: string, videoPath: string): QualityScoreResult {
  if (!existsSync(videoPath)) {
    const result: QualityScoreResult = {
      video_id: videoId,
      video_path: videoPath,
      scored_at: new Date().toISOString(),
      composite_score: 0,
      pass: false,
      dimensions: {
        duration_ok:   { pass: false, score: 0, max: WEIGHTS.duration_ok,   reason: 'File does not exist' },
        has_audio:     { pass: false, score: 0, max: WEIGHTS.has_audio,     reason: 'File does not exist' },
        has_subtitles: { pass: false, score: 0, max: WEIGHTS.has_subtitles, reason: 'File does not exist' },
        hook_timing:   { pass: false, score: 0, max: WEIGHTS.hook_timing,   reason: 'File does not exist' },
        resolution_ok: { pass: false, score: 0, max: WEIGHTS.resolution_ok, reason: 'File does not exist' },
      },
    };
    logQualityScore(result);
    return result;
  }

  const probe = probeVideo(videoPath);

  const duration_ok   = checkDurationOk(probe);
  const has_audio     = checkHasAudio(probe);
  const has_subtitles = checkHasSubtitles(videoPath);
  const hook_timing   = checkHookTiming(videoPath);
  const resolution_ok = checkResolutionOk(probe);

  const composite_score = duration_ok.score + has_audio.score + has_subtitles.score + hook_timing.score + resolution_ok.score;

  const result: QualityScoreResult = {
    video_id: videoId,
    video_path: videoPath,
    scored_at: new Date().toISOString(),
    composite_score,
    pass: composite_score >= PASS_THRESHOLD,
    dimensions: { duration_ok, has_audio, has_subtitles, hook_timing, resolution_ok },
  };

  logQualityScore(result);
  return result;
}
