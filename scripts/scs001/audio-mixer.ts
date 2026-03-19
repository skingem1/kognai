/**
 * SCS-001 Audio Mixer
 *
 * Mixes voiceover audio + background music + original clip audio into final video.
 * Uses FFmpeg amix/amerge filters.
 *
 * Audio layers:
 *   1. Voiceover (per-segment .mp3 from TTS) — full volume during non-clip segments
 *   2. Background music (looped, low volume) — constant -15dB throughout
 *   3. Original clip audio — full volume during clip segment only
 *
 * Requires: ffmpeg installed
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join, basename, extname } from "path";
import type { VoiceoverResult, VoiceoverSegment } from "./tts-voiceover";
import type { ScriptBundle } from "../../agents/scs001-script/index";

// ── Types ──────────────────────────────────────────────

export interface MixConfig {
  voiceover: VoiceoverResult;
  bundle: ScriptBundle;
  videoPath: string;
  backgroundMusicPath?: string;
  outputDir?: string;
  backgroundMusicVolume?: number; // 0.0-1.0, default 0.15
}

export interface MixResult {
  output_path: string;
  script_id: string;
  has_voiceover: boolean;
  has_background_music: boolean;
  has_clip_audio: boolean;
  duration_s: number;
}

// ── Config ─────────────────────────────────────────────

const ROOT = join(__dirname, "..", "..");
const DEFAULT_OUT_DIR = join(ROOT, "workspace", "scs001", "mixed-output");
const DEFAULT_MUSIC_DIR = join(ROOT, "workspace", "scs001", "background-music");

// ── FFmpeg Helpers ─────────────────────────────────────

function ffmpegAvailable(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function getAudioDuration(audioPath: string): number {
  try {
    const output = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`,
      { stdio: "pipe" }
    ).toString().trim();
    return parseFloat(output) || 0;
  } catch {
    return 0;
  }
}

// ── Voiceover Concatenation ────────────────────────────

/**
 * Concatenate per-segment voiceover files into a single timeline-aligned audio.
 * Inserts silence for segments without voiceover (e.g., clip segment).
 */
export function concatVoiceover(
  voiceover: VoiceoverResult,
  bundle: ScriptBundle,
  outputPath: string,
  dryRun: boolean = false
): string {
  if (dryRun) {
    console.log(`  [DRY RUN] Would concat ${voiceover.segments.length} voiceover segments`);
    return outputPath;
  }

  if (voiceover.segments.length === 0) {
    throw new Error("No voiceover segments to concatenate");
  }

  // Build FFmpeg filter for timeline positioning
  // Each segment gets placed at its start_s position
  const inputs: string[] = [];
  const filterParts: string[] = [];

  for (let i = 0; i < bundle.segments.length; i++) {
    const seg = bundle.segments[i];
    const voSeg = voiceover.segments.find((v) => v.segment_name === seg.segment_name);
    const duration = seg.end_s - seg.start_s;

    if (voSeg && existsSync(voSeg.audio_path)) {
      inputs.push(`-i "${voSeg.audio_path}"`);
      const inputIdx = inputs.length - 1;
      // Pad with silence before and trim to segment duration
      filterParts.push(
        `[${inputIdx}:a]adelay=${Math.round(seg.start_s * 1000)}|${Math.round(seg.start_s * 1000)},atrim=0:${duration}[vo${i}]`
      );
    } else {
      // Generate silence for this segment duration
      filterParts.push(
        `anullsrc=r=44100:cl=stereo,atrim=0:${duration},adelay=${Math.round(seg.start_s * 1000)}|${Math.round(seg.start_s * 1000)}[vo${i}]`
      );
    }
  }

  const mixInputs = bundle.segments.map((_, i) => `[vo${i}]`).join("");
  const totalDuration = bundle.total_duration_seconds;

  const filter = [
    ...filterParts,
    `${mixInputs}amix=inputs=${bundle.segments.length}:duration=first:dropout_transition=0,atrim=0:${totalDuration}[out]`,
  ].join(";");

  const cmd = `ffmpeg -y ${inputs.join(" ")} -filter_complex "${filter}" -map "[out]" "${outputPath}" 2>/dev/null`;

  try {
    execSync(cmd, { stdio: "pipe", timeout: 60000 });
    return outputPath;
  } catch (err: any) {
    console.warn(`  Voiceover concat failed: ${err.message}`);
    throw err;
  }
}

// ── Final Mix ──────────────────────────────────────────

/**
 * Mix voiceover + background music + original video audio into final output.
 */
export function mixAudio(config: MixConfig, dryRun: boolean = false): MixResult {
  const {
    voiceover,
    bundle,
    videoPath,
    backgroundMusicPath,
    outputDir = DEFAULT_OUT_DIR,
    backgroundMusicVolume = 0.15,
  } = config;

  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${bundle.script_id}_mixed.mp4`);

  const hasVoiceover = voiceover.segments.length > 0;
  const hasBgMusic = !!backgroundMusicPath && existsSync(backgroundMusicPath);
  const hasVideo = existsSync(videoPath);

  if (dryRun) {
    console.log(`  [DRY RUN] Mix: voiceover=${hasVoiceover} music=${hasBgMusic} video=${hasVideo}`);
    return {
      output_path: outputPath,
      script_id: bundle.script_id,
      has_voiceover: hasVoiceover,
      has_background_music: hasBgMusic,
      has_clip_audio: hasVideo,
      duration_s: bundle.total_duration_seconds,
    };
  }

  if (!ffmpegAvailable()) {
    throw new Error("FFmpeg not available");
  }

  if (!hasVideo) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  // Build FFmpeg command with audio mixing
  const inputs = [`-i "${videoPath}"`]; // Input 0: video with original audio
  const filters: string[] = [];
  let audioStreamCount = 1; // Start with original video audio

  // Original video audio (lowered during voiceover segments, full during clip)
  filters.push(`[0:a]volume=1.0[orig]`);

  if (hasVoiceover) {
    // Concat voiceover segments into single track
    const voTmpPath = join(outputDir, `${bundle.script_id}_vo_concat.mp3`);
    try {
      concatVoiceover(voiceover, bundle, voTmpPath);
      inputs.push(`-i "${voTmpPath}"`);
      filters.push(`[${audioStreamCount}:a]volume=1.0[voice]`);
      audioStreamCount++;
    } catch {
      console.warn("  Voiceover concat failed — mixing without voiceover");
    }
  }

  if (hasBgMusic) {
    inputs.push(`-stream_loop -1 -i "${backgroundMusicPath}"`);
    const dur = bundle.total_duration_seconds;
    filters.push(
      `[${audioStreamCount}:a]volume=${backgroundMusicVolume},atrim=0:${dur}[music]`
    );
    audioStreamCount++;
  }

  // Build amix filter
  const mixSources: string[] = ["[orig]"];
  if (hasVoiceover && audioStreamCount > 1) mixSources.push("[voice]");
  if (hasBgMusic) mixSources.push("[music]");

  const filterComplex = [
    ...filters,
    `${mixSources.join("")}amix=inputs=${mixSources.length}:duration=first:dropout_transition=2[aout]`,
  ].join(";");

  const cmd = [
    "ffmpeg -y",
    inputs.join(" "),
    `-filter_complex "${filterComplex}"`,
    '-map 0:v -map "[aout]"',
    "-c:v copy -c:a aac -b:a 128k",
    `-t ${bundle.total_duration_seconds}`,
    `"${outputPath}"`,
    "2>/dev/null",
  ].join(" ");

  try {
    execSync(cmd, { stdio: "pipe", timeout: 120000 });
  } catch (err: any) {
    console.warn(`  Audio mixing failed: ${err.message}`);
    // Fallback: copy video without audio mixing
    execSync(`ffmpeg -y -i "${videoPath}" -c copy "${outputPath}" 2>/dev/null`, {
      stdio: "pipe",
      timeout: 30000,
    });
  }

  return {
    output_path: outputPath,
    script_id: bundle.script_id,
    has_voiceover: hasVoiceover,
    has_background_music: hasBgMusic,
    has_clip_audio: hasVideo,
    duration_s: bundle.total_duration_seconds,
  };
}
