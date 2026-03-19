#!/usr/bin/env ts-node
/**
 * SCS-001 Audio Transcription Module
 * Uses OpenAI Whisper API to transcribe audio from video clips.
 *
 * Usage:
 *   npx ts-node scripts/scs001/transcribe-audio.ts --input <video-or-audio-path> [--output <dir>] [--dry-run]
 *   npx ts-node scripts/scs001/transcribe-audio.ts --batch <clip-scores-dir> [--output <dir>] [--dry-run]
 *
 * Requires: OPENAI_API_KEY env var
 * Saves transcripts as JSON to workspace/scs001/transcripts/
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, basename, extname } from "path";
import { execSync } from "child_process";

// ── Types ──────────────────────────────────────────────

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  source_file: string;
  clip_id: string;
  language: string;
  duration_s: number;
  text: string;
  segments: TranscriptSegment[];
  model: string;
  transcribed_at: string;
  cost_usd: number;
}

// ── Config ─────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const WHISPER_MODEL = "whisper-1";
const WHISPER_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const MAX_FILE_SIZE_MB = 25; // OpenAI limit
const SUPPORTED_FORMATS = [".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm", ".ogg"];

const ROOT = join(__dirname, "..", "..");
const DEFAULT_OUT_DIR = join(ROOT, "workspace", "scs001", "transcripts");

// ── Audio Extraction ───────────────────────────────────

/**
 * Extract audio from video file using FFmpeg.
 * Returns path to temporary .mp3 file.
 */
export function extractAudio(videoPath: string): string {
  const tmpDir = join(ROOT, "workspace", "scs001", "tmp-audio");
  mkdirSync(tmpDir, { recursive: true });
  const outPath = join(tmpDir, basename(videoPath, extname(videoPath)) + ".mp3");

  if (existsSync(outPath)) return outPath;

  try {
    execSync(
      `ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 4 -y "${outPath}" 2>/dev/null`,
      { stdio: "pipe", timeout: 60000 }
    );
    return outPath;
  } catch (e: any) {
    throw new Error(`FFmpeg audio extraction failed for ${videoPath}: ${e.message}`);
  }
}

// ── Whisper API ────────────────────────────────────────

/**
 * Transcribe an audio file using OpenAI Whisper API.
 * Returns raw API response with segments.
 */
export async function transcribeWithWhisper(
  audioPath: string,
  language?: string
): Promise<{ text: string; segments: TranscriptSegment[]; language: string; duration: number }> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set — cannot call Whisper API");
  }

  const fileBuffer = readFileSync(audioPath);
  const fileSizeMB = fileBuffer.length / (1024 * 1024);
  if (fileSizeMB > MAX_FILE_SIZE_MB) {
    throw new Error(`File ${audioPath} is ${fileSizeMB.toFixed(1)}MB — exceeds ${MAX_FILE_SIZE_MB}MB limit`);
  }

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: "audio/mpeg" });
  formData.append("file", blob, basename(audioPath));
  formData.append("model", WHISPER_MODEL);
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");
  if (language) formData.append("language", language);

  const resp = await fetch(WHISPER_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Whisper API error ${resp.status}: ${err}`);
  }

  const data = await resp.json() as any;
  return {
    text: data.text || "",
    segments: (data.segments || []).map((s: any) => ({
      start: s.start,
      end: s.end,
      text: s.text?.trim() || "",
    })),
    language: data.language || language || "unknown",
    duration: data.duration || 0,
  };
}

// ── Transcription Pipeline ─────────────────────────────

/**
 * Transcribe a single video/audio file. Extracts audio if needed.
 * Returns a TranscriptResult and saves it to disk.
 */
export async function transcribeClip(
  inputPath: string,
  clipId: string,
  outDir: string = DEFAULT_OUT_DIR,
  dryRun: boolean = false
): Promise<TranscriptResult> {
  const ext = extname(inputPath).toLowerCase();
  const isVideo = [".mp4", ".webm", ".mkv", ".avi", ".mov"].includes(ext);

  let audioPath = inputPath;
  if (isVideo) {
    console.log(`  Extracting audio from ${basename(inputPath)}...`);
    if (!dryRun) {
      audioPath = extractAudio(inputPath);
    }
  }

  if (dryRun) {
    const result: TranscriptResult = {
      source_file: inputPath,
      clip_id: clipId,
      language: "en",
      duration_s: 0,
      text: "[DRY RUN — no API call made]",
      segments: [],
      model: WHISPER_MODEL,
      transcribed_at: new Date().toISOString(),
      cost_usd: 0,
    };
    console.log(`  [DRY RUN] Would transcribe: ${basename(inputPath)}`);
    return result;
  }

  console.log(`  Transcribing ${basename(audioPath)} via Whisper API...`);
  const whisperResult = await transcribeWithWhisper(audioPath);

  // Whisper pricing: $0.006/minute
  const costUsd = (whisperResult.duration / 60) * 0.006;

  const result: TranscriptResult = {
    source_file: inputPath,
    clip_id: clipId,
    language: whisperResult.language,
    duration_s: whisperResult.duration,
    text: whisperResult.text,
    segments: whisperResult.segments,
    model: WHISPER_MODEL,
    transcribed_at: new Date().toISOString(),
    cost_usd: Math.round(costUsd * 1000000) / 1000000,
  };

  // Save transcript
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${clipId}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`  Saved transcript: ${outPath} (${whisperResult.segments.length} segments, ${whisperResult.duration.toFixed(1)}s)`);

  return result;
}

// ── Batch Processing ───────────────────────────────────

/**
 * Scan a directory of clip score JSONs, find qualified clips with video paths,
 * and transcribe each one.
 */
export async function transcribeBatch(
  clipScoresDir: string,
  outDir: string = DEFAULT_OUT_DIR,
  dryRun: boolean = false
): Promise<TranscriptResult[]> {
  const results: TranscriptResult[] = [];

  if (!existsSync(clipScoresDir)) {
    console.log(`  Clip scores directory not found: ${clipScoresDir}`);
    return results;
  }

  const files = readdirSync(clipScoresDir).filter((f) => f.endsWith(".json"));
  console.log(`\n  Found ${files.length} clip score files in ${clipScoresDir}\n`);

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(clipScoresDir, file), "utf8"));
      const clips = Array.isArray(data) ? data : data.clips || data.scores || [];

      for (const clip of clips) {
        if (!clip.qualified && clip.total_score < 20) continue;
        const videoPath = clip.video_path || clip.source_path || clip.file;
        if (!videoPath || !existsSync(videoPath)) continue;

        const clipId = clip.clip_id || clip.id || basename(videoPath, extname(videoPath));
        const result = await transcribeClip(videoPath, clipId, outDir, dryRun);
        results.push(result);
      }
    } catch (e: any) {
      console.log(`  Skipping ${file}: ${e.message}`);
    }
  }

  return results;
}

// ── CLI ────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string, def: string): string => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : def;
  };

  const inputFile = getArg("--input", "");
  const batchDir = getArg("--batch", "");
  const outDir = getArg("--output", DEFAULT_OUT_DIR);
  const dryRun = args.includes("--dry-run");

  console.log("\n🎙️ SCS-001 Audio Transcription\n");
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Output: ${outDir}`);
  console.log(`  API Key: ${OPENAI_API_KEY ? "SET" : "NOT SET"}\n`);

  if (inputFile) {
    if (!existsSync(inputFile)) {
      console.error(`  File not found: ${inputFile}`);
      process.exit(1);
    }
    const clipId = basename(inputFile, extname(inputFile));
    await transcribeClip(inputFile, clipId, outDir, dryRun);
  } else if (batchDir) {
    const results = await transcribeBatch(batchDir, outDir, dryRun);
    console.log(`\n  Batch complete: ${results.length} clips transcribed`);
  } else {
    console.log("  Usage:");
    console.log("    --input <path>  Transcribe a single video/audio file");
    console.log("    --batch <dir>   Transcribe all qualified clips from clip-scores dir");
    console.log("    --output <dir>  Output directory (default: workspace/scs001/transcripts/)");
    console.log("    --dry-run       Simulate without API calls");
  }
}

main().catch((e) => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
