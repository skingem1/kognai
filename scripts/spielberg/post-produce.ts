/**
 * Spielberg — Post-Production Pipeline
 * Sprint 957 / Spec 545-05 to 545-06
 *
 * Concatenates: [title card 3s] + [terminal content] + [closing card 5s]
 * Output: 1920x1080, H.264+AAC, 30fps
 *
 * Uses FFmpeg color filter for title/closing cards (no drawtext / libfreetype required).
 * Follows SCS-001 v2 Movie Editor pattern.
 */

import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { PostProductionConfig } from './types';

const W = 1920;
const H = 1080;
const FPS = 30;

/** Color for title card background (dark navy, branded) */
const TITLE_BG = '0x0a0f1e';
/** Color for closing card background */
const CLOSING_BG = '0x0a0f1e';
/** Color for caption bar background */
const CAPTION_BG = '0x000000@0.7';

// ── FFmpeg helpers ─────────────────────────────────────────────────────────────

/** Build a solid-color card MP4 of a given duration */
function buildColorCard(color: string, durationSec: number, outPath: string): void {
  execSync(
    `ffmpeg -y -f lavfi -i "color=c=${color}:size=${W}x${H}:duration=${durationSec}:rate=${FPS},format=yuv420p" ` +
    `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${outPath}"`,
    { stdio: 'pipe' }
  );
}

/** Scale + pad a GIF/video to 1920x1080 and output as MP4 */
function scaleToFull(inputPath: string, outPath: string): void {
  const scaleFilter = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`;
  execSync(
    `ffmpeg -y -i "${inputPath}" -vf "${scaleFilter}" ` +
    `-c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -r ${FPS} "${outPath}"`,
    { stdio: 'pipe' }
  );
}

/** Write FFmpeg concat list file */
function writeConcatList(parts: string[], listPath: string): void {
  const content = parts.map(p => `file '${p}'`).join('\n');
  writeFileSync(listPath, content + '\n', 'utf-8');
}

/** Concatenate video parts via FFmpeg concat demuxer */
function concatParts(listPath: string, outPath: string): void {
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -r ${FPS} "${outPath}"`,
    { stdio: 'pipe' }
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface PostProduceOptions {
  /** Path to the terminal content GIF or MP4 */
  contentPath: string;
  /** Output directory */
  outDir: string;
  /** Script ID (used for filenames) */
  scriptId: string;
  /** Post-production config from DemoScript */
  config: PostProductionConfig;
}

/**
 * Run the full post-production pipeline:
 * 1. Title card (3s solid color block)
 * 2. Terminal content (scaled to 1920x1080)
 * 3. Closing card (5s solid color block)
 * → concatenate into final MP4
 */
export function postProduce(opts: PostProduceOptions): string {
  const { contentPath, outDir, scriptId, config } = opts;
  const titleDur = config.titleCard?.durationSec ?? 3;
  const closingDur = config.closingCard?.durationSec ?? 5;

  const titlePath   = resolve(outDir, `${scriptId}-title.mp4`);
  const contentMp4  = resolve(outDir, `${scriptId}-content.mp4`);
  const closingPath = resolve(outDir, `${scriptId}-closing.mp4`);
  const listPath    = resolve(outDir, `${scriptId}-concat.txt`);
  const finalPath   = resolve(outDir, `${scriptId}.mp4`);

  // 1. Title card
  buildColorCard(TITLE_BG, titleDur, titlePath);

  // 2. Scale terminal content
  scaleToFull(contentPath, contentMp4);

  // 3. Closing card
  buildColorCard(CLOSING_BG, closingDur, closingPath);

  // 4. Concatenate
  writeConcatList([titlePath, contentMp4, closingPath], listPath);
  concatParts(listPath, finalPath);

  return finalPath;
}

/**
 * Headless recording mode: run a shell script under asciinema
 * without requiring an interactive TTY.
 * Returns the path to the .cast file.
 */
export function headlessRecord(opts: {
  runnerScript: string;
  castPath: string;
  cols: number;
  rows: number;
}): string {
  const { runnerScript, castPath, cols, rows } = opts;
  // Use `script` (BSD/macOS) to provide a PTY for asciinema in headless environments.
  // Falls back to direct invocation when `script` is unavailable.
  execSync(
    `asciinema rec --cols ${cols} --rows ${rows} --overwrite -c "bash '${runnerScript}'" "${castPath}"`,
    {
      stdio: ['pipe', 'pipe', 'pipe'],  // Sprint 1225: pipe all — inherit pollutes batch-run.ts stdout
      env: { ...process.env, TERM: 'xterm-256color' },
    }
  );
  return castPath;
}
