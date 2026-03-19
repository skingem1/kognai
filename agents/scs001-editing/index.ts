// SCS-001 — Editing Agent (Agent 5 — Production Layer)
// Consumes: ScriptBundle[] from Script Agent
// Produces: EditedVideo[] (per contracts/scs-001/video-production-v1.json)
// Engine: FFmpeg — deterministic video assembly, no LLM calls
// Block C: mock mode generates test-pattern videos for validation
// Note: drawtext requires libfreetype. Mock mode uses pure color sources.

import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import type { ScriptBundle, ScriptSegment } from '../scs001-script/index';

export interface EditedVideo {
  video_id:                  string;
  clip_id:                   string;
  insight_id:                string;
  file_path:                 string;
  duration_seconds:          number;
  aspect_ratio:              '9:16';
  editing_structure: {
    hook_end_s:              number;
    context_end_s:           number;
    clip_end_s:              number;
    commentary_end_s:        number;
    insight_end_s:           number;
    loop_ending:             boolean;
  };
  pattern_interrupt_count:   number;
  ffmpeg_processing_seconds: number;
}

const FFMPEG = process.env.FFMPEG_PATH ?? '/opt/homebrew/bin/ffmpeg';

// Detect drawtext filter availability (requires libfreetype)
let HAS_DRAWTEXT: boolean | null = null;
function hasDrawtext(): boolean {
  if (HAS_DRAWTEXT !== null) return HAS_DRAWTEXT;
  try {
    execSync(`${FFMPEG} -filters 2>&1 | grep drawtext`, { stdio: 'pipe', timeout: 5000 });
    HAS_DRAWTEXT = true;
  } catch {
    HAS_DRAWTEXT = false;
    console.warn('[EditingAgent] drawtext filter not available — falling back to color-block mode');
  }
  return HAS_DRAWTEXT;
}

// Segment → background colour mapping for mock mode
// Each segment gets a distinct color so the video structure is visible
const SEGMENT_COLORS: Record<ScriptSegment['segment_name'], string> = {
  hook:       '0x1A1A2E',   // dark navy
  context:    '0x16213E',   // midnight blue
  clip:       '0x0F3460',   // deep blue
  commentary: '0x533483',   // purple
  insight:    '0xE94560',   // red accent
  loop:       '0x2D2D44',   // slate (callback to hook, slightly different)
};

function buildMockSegmentFilter(seg: ScriptSegment, idx: number): string {
  const duration = seg.end_s - seg.start_s;
  const color = SEGMENT_COLORS[seg.segment_name];
  // Pure color source — no drawtext (requires libfreetype not in default brew ffmpeg)
  return `color=c=${color}:s=1080x1920:d=${duration}:r=30`;
}

function buildMockFFmpegCommand(bundle: ScriptBundle, outputPath: string): string {
  const segments = bundle.segments;
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  // Build each segment as a separate filter chain
  segments.forEach((seg, idx) => {
    const filter = buildMockSegmentFilter(seg, idx);
    filterParts.push(`${filter}[seg${idx}]`);
    concatInputs.push(`[seg${idx}]`);
  });

  // Concatenate all segments
  const concatFilter = concatInputs.join('') + `concat=n=${segments.length}:v=1:a=0[outv]`;
  filterParts.push(concatFilter);

  const filterComplex = filterParts.join('; ');

  // Silent audio track for the full duration
  const totalDuration = bundle.total_duration_seconds;

  return [
    FFMPEG,
    '-y',
    '-f lavfi -i anullsrc=r=44100:cl=stereo',
    `-filter_complex "${filterComplex}"`,
    '-map "[outv]"',
    '-map 0:a',
    `-t ${totalDuration}`,
    '-c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p',
    '-c:a aac -b:a 128k',
    '-movflags +faststart',
    `-metadata title="SCS-001 ${bundle.script_id}"`,
    `"${outputPath}"`,
  ].join(' ');
}

// Escape text for FFmpeg drawtext filter (escape single quotes, backslashes, colons)
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .substring(0, 80); // cap length to avoid command overflow
}

// Find a real clip file for the given clip_id.
// Lookup order:
//   1. {clipsDir}/{clipId}.mp4           — exact match (clip downloaded with clip_id as filename)
//   2. {clipsDir}/{clipId}*.mp4          — partial prefix match
//   3. First available .mp4 in clipsDir  — round-robin fallback when pipeline hasn't matched IDs
// Returns null if the directory is empty or doesn't exist.
function findClipFile(clipsDir: string, clipId: string): string | null {
  try {
    if (!existsSync(clipsDir)) return null;
    const files = readdirSync(clipsDir).filter(f => f.endsWith('.mp4'));
    if (files.length === 0) return null;
    // 1. Exact match
    const exact = join(clipsDir, clipId + '.mp4');
    if (existsSync(exact)) return exact;
    // 2. Prefix match (e.g. clipId="clip-abc123" → "clip-abc123-..." file)
    const prefix = files.find(f => f.startsWith(clipId));
    if (prefix) return join(clipsDir, prefix);
    // 3. Stable deterministic fallback: pick by hash of clipId to spread load across clips
    const pick = files[Math.abs(clipId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % files.length];
    return join(clipsDir, pick);
  } catch {
    return null;
  }
}

// Production segment filter: colored background + drawtext overlay
// Uses macOS system Helvetica font — no external dependency
function buildProductionSegmentFilter(seg: ScriptSegment, idx: number, bundle: ScriptBundle): string {
  const duration = seg.end_s - seg.start_s;
  const color = SEGMENT_COLORS[seg.segment_name];
  const FONT = '/System/Library/Fonts/Helvetica.ttc';

  const mainText = escapeDrawtext(seg.caption_text || seg.voiceover_text || seg.segment_name);
  const mainDrawtext = `drawtext=fontfile='${FONT}':text='${mainText}':x=(w-tw)/2:y=(h-th)/2:fontsize=48:fontcolor=white:borderw=3:bordercolor=black`;

  // Constitutional mandate: why_does_this_matter must appear in insight segment
  const isInsight = seg.segment_name === 'insight';
  const whyText = isInsight ? escapeDrawtext((bundle as any).why_does_this_matter || '') : '';
  const whyDrawtext = isInsight && whyText
    ? `;[seg${idx}a]drawtext=fontfile='${FONT}':text='${whyText}':x=(w-tw)/2:y=(h-th)/2+60:fontsize=32:fontcolor=white:borderw=2:bordercolor=black[seg${idx}]`
    : '';

  if (isInsight && whyText) {
    return `color=c=${color}:s=1080x1920:d=${duration}:r=30[seg${idx}base];[seg${idx}base]${mainDrawtext}[seg${idx}a]${whyDrawtext}`;
  }
  return `color=c=${color}:s=1080x1920:d=${duration}:r=30[seg${idx}base];[seg${idx}base]${mainDrawtext}[seg${idx}]`;
}

function buildProductionFFmpegCommand(bundle: ScriptBundle, outputPath: string): string {
  const segments = bundle.segments;
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  segments.forEach((seg, idx) => {
    const filter = buildProductionSegmentFilter(seg, idx, bundle);
    filterParts.push(filter);
    concatInputs.push(`[seg${idx}]`);
  });

  const concatFilter = concatInputs.join('') + `concat=n=${segments.length}:v=1:a=0[outv]`;
  filterParts.push(concatFilter);

  const filterComplex = filterParts.join('; ');
  const totalDuration = bundle.total_duration_seconds;

  return [
    FFMPEG,
    '-y',
    '-f lavfi -i anullsrc=r=44100:cl=stereo',
    `-filter_complex "${filterComplex}"`,
    '-map "[outv]"',
    '-map 0:a',
    `-t ${totalDuration}`,
    '-c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p',
    '-c:a aac -b:a 128k',
    '-movflags +faststart',
    `-metadata title="SCS-001 ${bundle.script_id}"`,
    `"${outputPath}"`,
  ].join(' ');
}

// Real-clip FFmpeg command.
// Input 0 : anullsrc (silent audio for full duration)
// Input 1 : actual clip MP4 (real content — used for the 'clip' segment only)
//
// Structure:
//   hook       → colored title card (dark navy)
//   context    → colored title card (midnight blue)
//   clip       → trimmed real clip, scaled to 1080×1920, 30 fps
//   commentary → colored title card (purple)
//   insight    → colored title card (red)
//   loop       → colored title card (slate) — callback to hook tone
//
// Audio: silent throughout (TTS/voiceover layer added later).
// Works without libfreetype — no drawtext dependency.
function buildRealFFmpegCommand(bundle: ScriptBundle, outputPath: string, clipFile: string): string {
  const segments = bundle.segments;
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  segments.forEach((seg, idx) => {
    const duration = seg.end_s - seg.start_s;
    if (seg.segment_name === 'clip') {
      // Use real video: trim to segment duration, force 1080×1920, 30 fps.
      // The clips on disk are already 1080×1920 so scale is a no-op but keeps
      // the filter chain robust if clip dimensions ever differ.
      // setsar=1 normalises pixel aspect ratio (clips often have SAR ≠ 1:1)
      // so concat can mix them with the 1:1 color sources without a mismatch error.
      filterParts.push(
        `[1:v]trim=start=0:duration=${duration},setpts=PTS-STARTPTS,` +
        `scale=1080:1920:force_original_aspect_ratio=decrease,` +
        `pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1[seg${idx}]`
      );
    } else {
      const color = SEGMENT_COLORS[seg.segment_name];
      filterParts.push(`color=c=${color}:s=1080x1920:d=${duration}:r=30[seg${idx}]`);
    }
    concatInputs.push(`[seg${idx}]`);
  });

  const concatFilter = concatInputs.join('') + `concat=n=${segments.length}:v=1:a=0[outv]`;
  filterParts.push(concatFilter);

  const filterComplex = filterParts.join('; ');
  const totalDuration = bundle.total_duration_seconds;

  return [
    FFMPEG,
    '-y',
    '-f lavfi -i anullsrc=r=44100:cl=stereo',
    `-i "${clipFile}"`,
    `-filter_complex "${filterComplex}"`,
    '-map "[outv]"',
    '-map 0:a',
    `-t ${totalDuration}`,
    '-c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p',
    '-c:a aac -b:a 128k',
    '-movflags +faststart',
    `-metadata title="SCS-001 ${bundle.script_id}"`,
    `"${outputPath}"`,
  ].join(' ');
}

export class EditingAgent {
  private outputDir: string;

  constructor(outputDir: string = 'workspace/scs001/editing-outputs') {
    this.outputDir = outputDir;
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  run(bundles: ScriptBundle[]): EditedVideo[] {
    const mode = process.env.SCS_EDITING_MODE ?? 'mock';
    console.log('[EditingAgent] ' + bundles.length + ' ScriptBundles in (mode: ' + mode + ')');

    const videos: EditedVideo[] = [];
    for (const bundle of bundles) {
      try {
        const video = this.assembleVideo(bundle);
        videos.push(video);
        console.log('[EditingAgent] \u2713 ' + bundle.script_id + ' \u2192 ' + video.file_path + ' (' + video.ffmpeg_processing_seconds.toFixed(1) + 's render)');
      } catch (err) {
        console.warn('[EditingAgent] \u2717 ' + bundle.script_id + ' failed: ' + (err as Error).message);
      }
    }

    console.log('[EditingAgent] ' + videos.length + '/' + bundles.length + ' EditedVideos produced');
    return videos;
  }

  private assembleVideo(bundle: ScriptBundle): EditedVideo {
    const videoId = 'video-' + randomUUID().slice(0, 8);
    const outputPath = this.outputDir + '/' + videoId + '.mp4';

    // Build and execute FFmpeg command.
    // Priority:
    //   1. real  — a clip file exists → use actual video for the 'clip' segment
    //   2. production — drawtext (libfreetype) available → colored title cards + text overlays
    //   3. mock  — pure colored blocks, no dependencies
    const clipsDir = process.env.SCS_CLIPS_DIR ?? join(process.cwd(), 'clips');
    const clipFile = findClipFile(clipsDir, bundle.clip_id);

    let cmd: string;
    let modeLabel: string;
    if (clipFile) {
      cmd = buildRealFFmpegCommand(bundle, outputPath, clipFile);
      modeLabel = 'real (' + clipFile.split('/').pop() + ')';
    } else {
      const wantsProduction = (process.env.SCS_EDITING_MODE ?? 'mock') === 'production';
      const useProduction = wantsProduction && hasDrawtext();
      cmd = useProduction
        ? buildProductionFFmpegCommand(bundle, outputPath)
        : buildMockFFmpegCommand(bundle, outputPath);
      modeLabel = useProduction ? 'production' : (wantsProduction ? 'mock-fallback' : 'mock');
    }
    console.log('[EditingAgent] FFmpeg command length: ' + cmd.length + ' chars (mode: ' + modeLabel + ')');

    const startMs = Date.now();
    execSync(cmd, { stdio: 'pipe', timeout: 120_000 });
    const renderSeconds = (Date.now() - startMs) / 1000;

    if (!existsSync(outputPath)) {
      throw new Error('FFmpeg produced no output file: ' + outputPath);
    }

    // Extract editing structure from segments
    const segs = bundle.segments;
    const segByName = (name: string) => segs.find(s => s.segment_name === name);

    return {
      video_id:                videoId,
      clip_id:                 bundle.clip_id,
      insight_id:              bundle.insight_id,
      file_path:               outputPath,
      duration_seconds:        bundle.total_duration_seconds,
      aspect_ratio:            '9:16',
      editing_structure: {
        hook_end_s:            segByName('hook')?.end_s       ?? 2,
        context_end_s:         segByName('context')?.end_s    ?? 5,
        clip_end_s:            segByName('clip')?.end_s       ?? 12,
        commentary_end_s:      segByName('commentary')?.end_s ?? 18,
        insight_end_s:         segByName('insight')?.end_s    ?? 24,
        loop_ending:           bundle.loop_ending,
      },
      pattern_interrupt_count: bundle.pattern_interrupts.length,
      ffmpeg_processing_seconds: renderSeconds,
    };
  }
}

// Export FFmpeg command builders for testing/debugging
export { buildMockFFmpegCommand, buildProductionFFmpegCommand, buildProductionSegmentFilter, buildRealFFmpegCommand, findClipFile };
