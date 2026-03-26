/**
 * qc-agent.ts — QC Gate Hardening (QUALITY-01 Rev.3 Sprint 3/4)
 *
 * TICKET-009-Q01-03
 *
 * Provides ffprobe-based gate checks that validate actual video files
 * rather than trusting metadata flags. Two gates:
 *
 *   has_real_clip: file exists, size>100KB, video stream present, duration>1s
 *   has_audio:     audio stream present (codec_type=audio), duration>0.5s
 *
 * If either gate fails:
 *   - Returns a QCCheckResult with pass=false and reason
 *   - Logs to logs/qc-failures/YYYY-MM-DD.jsonl
 *   - Caller MUST NOT proceed to publishing
 */

import * as fs   from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface QCCheckResult {
  pass:   boolean;
  reason: string | null;
}

export interface QCVideoResult {
  video_id:      string;
  file_path:     string;
  has_real_clip: QCCheckResult;
  has_audio:     QCCheckResult;
  overall_pass:  boolean;
  checked_at:    string;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const MIN_CLIP_SIZE_BYTES = 100_000;   // 100KB
const MIN_CLIP_DURATION_S = 1.0;       // 1 second
const MIN_AUDIO_DURATION_S = 0.5;      // 0.5 seconds
const QC_FAILURES_DIR = path.join(__dirname, '../../logs/qc-failures');

// ── ffprobe Helpers ────────────────────────────────────────────────────────────

interface StreamInfo {
  codec_type: string;
  codec_name: string;
  duration?:  string;
}

interface FFProbeOutput {
  streams: StreamInfo[];
  format: {
    duration?: string;
    size?:     string;
  };
}

function runFFProbe(filePath: string): FFProbeOutput | null {
  try {
    const out = execSync(
      `ffprobe -v quiet -print_format json -show_streams -show_format "${filePath}"`,
      { stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 }
    ).toString();
    return JSON.parse(out) as FFProbeOutput;
  } catch {
    return null;
  }
}

// ── Gate: has_real_clip ────────────────────────────────────────────────────────

/**
 * Validate that a clip file is real footage (not empty/mock).
 * Checks: file exists, size>100KB, video stream present, duration>1s.
 */
export function checkHasRealClip(filePath: string): QCCheckResult {
  // 1. File must exist
  if (!fs.existsSync(filePath)) {
    return { pass: false, reason: `has_real_clip FAIL: file not found — ${filePath}` };
  }

  // 2. File must be >100KB
  const stat = fs.statSync(filePath);
  if (stat.size < MIN_CLIP_SIZE_BYTES) {
    return {
      pass: false,
      reason: `has_real_clip FAIL: file too small — ${stat.size} bytes (required >${MIN_CLIP_SIZE_BYTES})`,
    };
  }

  // 3. ffprobe must succeed
  const probe = runFFProbe(filePath);
  if (!probe) {
    return { pass: false, reason: `has_real_clip FAIL: ffprobe failed — cannot read ${filePath}` };
  }

  // 4. Video stream must be present
  const videoStream = probe.streams.find(s => s.codec_type === 'video');
  if (!videoStream) {
    return { pass: false, reason: `has_real_clip FAIL: no video stream found in ${filePath}` };
  }

  // 5. Duration must be >1s (use format.duration which covers the whole file)
  const duration = parseFloat(probe.format.duration || '0');
  if (duration < MIN_CLIP_DURATION_S) {
    return {
      pass: false,
      reason: `has_real_clip FAIL: duration ${duration.toFixed(2)}s < ${MIN_CLIP_DURATION_S}s`,
    };
  }

  return { pass: true, reason: null };
}

// ── Gate: has_audio ────────────────────────────────────────────────────────────

/**
 * Validate that a video file has an audible voiceover track.
 * Checks: audio stream present, audio duration>0.5s.
 */
export function checkHasAudio(filePath: string): QCCheckResult {
  if (!fs.existsSync(filePath)) {
    return { pass: false, reason: `has_audio FAIL: file not found — ${filePath}` };
  }

  const probe = runFFProbe(filePath);
  if (!probe) {
    return { pass: false, reason: `has_audio FAIL: ffprobe failed — cannot read ${filePath}` };
  }

  // 1. Audio stream must be present
  const audioStream = probe.streams.find(s => s.codec_type === 'audio');
  if (!audioStream) {
    return { pass: false, reason: `has_audio FAIL: no audio stream found in ${filePath}` };
  }

  // 2. Audio duration must be >0.5s (use stream duration; fall back to format.duration)
  const audioDuration = parseFloat(audioStream.duration || probe.format.duration || '0');
  if (audioDuration < MIN_AUDIO_DURATION_S) {
    return {
      pass: false,
      reason: `has_audio FAIL: audio duration ${audioDuration.toFixed(2)}s < ${MIN_AUDIO_DURATION_S}s`,
    };
  }

  return { pass: true, reason: null };
}

// ── QC Failure Logger ──────────────────────────────────────────────────────────

function logQCFailure(result: QCVideoResult): void {
  try {
    if (!fs.existsSync(QC_FAILURES_DIR)) fs.mkdirSync(QC_FAILURES_DIR, { recursive: true });
    const today    = new Date().toISOString().slice(0, 10);
    const logFile  = path.join(QC_FAILURES_DIR, `${today}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(result) + '\n');
  } catch { /* non-blocking */ }
}

// ── Main Gate Runner ───────────────────────────────────────────────────────────

/**
 * Run both QC gates against a video file.
 *
 * @param videoId   - identifier for logging
 * @param filePath  - absolute path to the video file
 * @returns QCVideoResult — check results + overall_pass flag
 *
 * If overall_pass is false, the caller MUST NOT proceed to publishing.
 * The failure is logged to logs/qc-failures/YYYY-MM-DD.jsonl automatically.
 */
export function runQCGates(videoId: string, filePath: string): QCVideoResult {
  const hasRealClip = checkHasRealClip(filePath);
  const hasAudio    = checkHasAudio(filePath);
  const overall     = hasRealClip.pass && hasAudio.pass;

  const result: QCVideoResult = {
    video_id:      videoId,
    file_path:     filePath,
    has_real_clip: hasRealClip,
    has_audio:     hasAudio,
    overall_pass:  overall,
    checked_at:    new Date().toISOString(),
  };

  if (!overall) {
    logQCFailure(result);
    const reasons = [hasRealClip.reason, hasAudio.reason].filter(Boolean).join(' | ');
    console.warn(`[QC] FAIL ${videoId}: ${reasons}`);
  } else {
    console.log(`[QC] PASS ${videoId}: has_real_clip ✓  has_audio ✓`);
  }

  return result;
}

/**
 * Batch QC check. Returns results for all files.
 * Filter result.overall_pass === false to find publish blockers.
 */
export function runQCGatesBatch(
  videos: Array<{ video_id: string; file_path: string }>
): QCVideoResult[] {
  return videos.map(v => runQCGates(v.video_id, v.file_path));
}
